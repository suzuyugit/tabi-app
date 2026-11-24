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
