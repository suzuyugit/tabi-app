import { db } from './db';
import { newId } from '../lib/id';

export async function addPacking(tripId: string, name: string): Promise<void> {
  const items = await db.packingItems.where('tripId').equals(tripId).toArray();
  const order = items.reduce((m, p) => Math.max(m, p.order), -1) + 1;
  await db.packingItems.add({ id: newId(), tripId, name, checked: false, order });
}

export async function togglePacking(id: string): Promise<void> {
  await db.packingItems.where('id').equals(id).modify((p) => {
    p.checked = !p.checked;
  });
}

export async function renamePacking(id: string, name: string): Promise<void> {
  await db.packingItems.update(id, { name });
}

export async function deletePacking(id: string): Promise<void> {
  await db.packingItems.delete(id);
}

/** 全部の選択を外す（帰りの荷造り用） */
export async function uncheckAll(tripId: string): Promise<void> {
  await db.packingItems.where('tripId').equals(tripId).modify((p) => {
    p.checked = false;
  });
}

/** 並び替えの結果を保存する（ids は新しい並び順） */
export async function reorderPacking(ids: string[]): Promise<void> {
  await db.transaction('rw', db.packingItems, async () => {
    const items = await db.packingItems.bulkGet(ids);
    await db.packingItems.bulkPut(items.flatMap((p, i) => (p ? [{ ...p, order: i }] : [])));
  });
}

/** 持ち物の名前を、旅行の持ち物に入れる。merge = 同じ名前がないものだけ最後に足す / replace = 全部入れ替える */
export async function putPackingNames(tripId: string, names: string[], mode: 'merge' | 'replace'): Promise<number> {
  return db.transaction('rw', db.packingItems, async () => {
    if (mode === 'replace') await db.packingItems.where('tripId').equals(tripId).delete();
    const have = await db.packingItems.where('tripId').equals(tripId).toArray();
    const seen = new Set(have.map((x) => x.name.trim()));
    let order = have.reduce((m, x) => Math.max(m, x.order), -1);
    const add = [];
    for (const raw of names) {
      const name = raw.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      add.push({ id: newId(), tripId, name, checked: false, order: ++order });
    }
    await db.packingItems.bulkAdd(add);
    return add.length;
  });
}

/** 旅行の持ち物に、まだない名前がいくつあるか */
export async function countMissingPacking(tripId: string, names: string[]): Promise<number> {
  const have = new Set((await db.packingItems.where('tripId').equals(tripId).toArray()).map((x) => x.name.trim()));
  return new Set(names.map((n) => n.trim()).filter((n) => n && !have.has(n))).size;
}

// --- 名前を付けて保存した持ち物リスト ---

/** 1行に1つの文字列 → 名前の一覧（空行と重複を除く） */
export function namesFromText(text: string): string[] {
  return [...new Set(text.split('\n').map((s) => s.trim()).filter(Boolean))];
}

export async function savePackingList(name: string, items: string[], id?: string): Promise<string> {
  const listId = id ?? newId();
  await db.packingLists.put({ id: listId, name: name.trim(), items: [...new Set(items.map((s) => s.trim()).filter(Boolean))], updatedAt: new Date().toISOString() });
  return listId;
}

export async function deletePackingList(id: string): Promise<void> {
  await db.packingLists.delete(id);
}

/** 旅行の持ち物（並び順）を名前の一覧で */
export async function tripPackingNames(tripId: string): Promise<string[]> {
  return (await db.packingItems.where('tripId').equals(tripId).sortBy('order')).map((p) => p.name);
}
