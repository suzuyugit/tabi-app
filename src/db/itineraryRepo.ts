import { db } from './db';
import type { ItineraryItem } from './types';
import { addDays, byOrder, daysBetween, insertIndex, itemKey } from '../lib/itinerary';
import { newId } from '../lib/id';
import { addMinutesHm } from '../lib/datetime';

export type ItemInput = Omit<ItineraryItem, 'id' | 'tripId' | 'order'>;

async function dayItems(tripId: string, date: string): Promise<ItineraryItem[]> {
  return (await db.itineraryItems.where('[tripId+date]').equals([tripId, date]).toArray()).sort(byOrder);
}

/** その日の並びの、時刻に合う位置に入れて order を振り直す（時差のある予定は現地時間に直して比べる） */
async function placeInDay(item: ItineraryItem): Promise<void> {
  const trip = (await db.trips.get(item.tripId)) ?? {};
  const others = (await dayItems(item.tripId, item.date)).filter((it) => it.id !== item.id);
  const list = [...others];
  list.splice(insertIndex(others.map((it) => itemKey(trip, it)), itemKey(trip, item)), 0, item);
  await db.itineraryItems.bulkPut(list.map((it, i) => ({ ...it, order: i })));
}

export async function createItem(tripId: string, input: ItemInput): Promise<string> {
  const item: ItineraryItem = { ...input, id: newId(), tripId, order: 0 };
  await db.transaction('rw', db.itineraryItems, db.trips, () => placeInDay(item));
  return item.id;
}

export async function updateItem(id: string, input: ItemInput): Promise<void> {
  await db.transaction('rw', db.itineraryItems, db.trips, async () => {
    const cur = await db.itineraryItems.get(id);
    if (!cur) throw new Error('予定が見つかりません');
    const next: ItineraryItem = { ...input, id, tripId: cur.tripId, order: cur.order, pinnedPos: cur.pinnedPos };
    // 続きのカードの位置に関わる項目を変えたら、手で動かした位置は忘れて自動の位置に戻す
    const keys = ['date', 'arrivalDate', 'arrivalTime', 'arrivalIn', 'checkOutDate', 'checkOutTime', 'kind'] as const;
    if (keys.some((k) => cur[k] !== next[k])) delete next.pinnedPos;
    if (cur.date === next.date && cur.time === next.time && cur.timeIn === next.timeIn) {
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

/**
 * 続きのカード（日をまたぐ移動・連泊）を動かした結果を保存する。
 * positions は「元の予定の ID → その日の並びでの位置」
 */
export async function pinContinuations(day: string, positions: Record<string, number>): Promise<void> {
  await db.transaction('rw', db.itineraryItems, async () => {
    for (const [id, pos] of Object.entries(positions)) {
      const it = await db.itineraryItems.get(id);
      if (it) await db.itineraryItems.put({ ...it, pinnedPos: { ...it.pinnedPos, [day]: pos } });
    }
  });
}

/** 予定を別の日（複数可）にコピーする */
export async function duplicateItem(id: string, dates: string[]): Promise<void> {
  await db.transaction('rw', db.itineraryItems, db.trips, async () => {
    const src = await db.itineraryItems.get(id);
    if (!src) return;
    for (const date of dates) {
      // 日をまたぐ移動は、到着日も同じだけずらす
      const arrivalDate = src.arrivalDate ? addDays(date, daysBetween(src.date, src.arrivalDate)) : undefined;
      // 宿泊はチェックアウトの日も同じだけずらす
      const checkOutDate = src.checkOutDate ? addDays(date, daysBetween(src.date, src.checkOutDate)) : undefined;
      const { pinnedPos: _drop, ...rest } = src;
      await placeInDay({ ...rest, id: newId(), date, arrivalDate, checkOutDate, order: 0 });
    }
  });
}

/**
 * 当日モードの「以降を○分ずらす」。ids の予定の時刻を delta 分ずらす（並び順はそのまま）。
 * 移動は、その日に着く到着時刻も一緒にずらす。0:00〜23:59 からはみ出す分は端で止め、その件数を返す
 */
export async function shiftItems(ids: string[], delta: number): Promise<{ shifted: number; clamped: number }> {
  let shifted = 0;
  let clamped = 0;
  await db.transaction('rw', db.itineraryItems, async () => {
    for (const it of await db.itineraryItems.bulkGet(ids)) {
      if (!it?.time) continue;
      const t = addMinutesHm(it.time, delta);
      const next = { ...it, time: t.time };
      if (t.clamped) clamped++;
      if (it.kind === 'move' && it.arrivalTime && (!it.arrivalDate || it.arrivalDate === it.date)) {
        const a = addMinutesHm(it.arrivalTime, delta);
        next.arrivalTime = a.time;
        if (a.clamped) clamped++;
      }
      await db.itineraryItems.put(next);
      shifted++;
    }
  });
  return { shifted, clamped };
}
