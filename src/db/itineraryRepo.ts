import { db } from './db';
import type { ItineraryItem } from './types';
import { byOrder, insertIndex } from '../lib/itinerary';
import { newId } from '../lib/id';

export type ItemInput = Omit<ItineraryItem, 'id' | 'tripId' | 'order'>;

async function dayItems(tripId: string, date: string): Promise<ItineraryItem[]> {
  return (await db.itineraryItems.where('[tripId+date]').equals([tripId, date]).toArray()).sort(byOrder);
}

/** その日の並びの、時刻に合う位置に入れて order を振り直す */
async function placeInDay(item: ItineraryItem): Promise<void> {
  const others = (await dayItems(item.tripId, item.date)).filter((it) => it.id !== item.id);
  const list = [...others];
  list.splice(insertIndex(others, item.time), 0, item);
  await db.itineraryItems.bulkPut(list.map((it, i) => ({ ...it, order: i })));
}

export async function createItem(tripId: string, input: ItemInput): Promise<string> {
  const item: ItineraryItem = { ...input, id: newId(), tripId, order: 0 };
  await db.transaction('rw', db.itineraryItems, () => placeInDay(item));
  return item.id;
}

export async function updateItem(id: string, input: ItemInput): Promise<void> {
  await db.transaction('rw', db.itineraryItems, async () => {
    const cur = await db.itineraryItems.get(id);
    if (!cur) throw new Error('予定が見つかりません');
    const next: ItineraryItem = { ...input, id, tripId: cur.tripId, order: cur.order };
    if (cur.date === next.date && cur.time === next.time) {
      // 日付も時刻も同じなら、長押しで並べた位置を保つ
      await db.itineraryItems.put(next);
    } else {
      await placeInDay(next);
      if (cur.date !== next.date) await renumber(cur.tripId, cur.date);
    }
  });
}

async function renumber(tripId: string, date: string): Promise<void> {
  const items = await dayItems(tripId, date);
  await db.itineraryItems.bulkPut(items.map((it, i) => ({ ...it, order: i })));
}

/** 予定を消す。ひも付いていた支出はひも付けだけ外す */
export async function deleteItem(id: string): Promise<void> {
  await db.transaction('rw', db.itineraryItems, db.expenses, async () => {
    const cur = await db.itineraryItems.get(id);
    if (!cur) return;
    await db.itineraryItems.delete(id);
    await renumber(cur.tripId, cur.date);
    const linked = await db.expenses.where('tripId').equals(cur.tripId).filter((e) => e.itemId === id).toArray();
    await db.expenses.bulkPut(linked.map(({ itemId: _drop, ...e }) => e));
  });
}

/** 長押しの並び替え結果を保存する（ids は新しい並び順） */
export async function reorderItems(ids: string[]): Promise<void> {
  await db.transaction('rw', db.itineraryItems, async () => {
    const items = await db.itineraryItems.bulkGet(ids);
    await db.itineraryItems.bulkPut(items.flatMap((it, i) => (it ? [{ ...it, order: i }] : [])));
  });
}

/** 予定を別の日（複数可）にコピーする */
export async function duplicateItem(id: string, dates: string[]): Promise<void> {
  await db.transaction('rw', db.itineraryItems, async () => {
    const src = await db.itineraryItems.get(id);
    if (!src) return;
    for (const date of dates) {
      await placeInDay({ ...src, id: newId(), date, order: 0 });
    }
  });
}
