import { db } from './db';
import type { Category, ItemKindDef } from './types';
import { newId } from '../lib/id';
import { LOCKED_CATEGORIES, LOCKED_KINDS, OTHER_CATEGORY, OTHER_KIND } from '../lib/kinds';

// --- 支出のカテゴリ ---

export async function addCategory(name: string, icon: string): Promise<string> {
  const id = `cat-u-${newId()}`;
  await db.categories.add({ id, name, icon, usageCount: 0 });
  return id;
}

export async function updateCategory(id: string, patch: Pick<Category, 'name' | 'icon'>): Promise<void> {
  await db.categories.update(id, patch);
}

/** カテゴリを消す。使っていた支出・予定の種類は「その他」に移す */
export async function deleteCategory(id: string): Promise<void> {
  if (LOCKED_CATEGORIES.has(id)) throw new Error('このカテゴリは消せません');
  await db.transaction('rw', db.categories, db.expenses, db.itemKinds, async () => {
    await db.expenses.where('categoryId').equals(id).modify({ categoryId: OTHER_CATEGORY });
    await db.itemKinds.filter((k) => k.categoryId === id).modify({ categoryId: OTHER_CATEGORY });
    await db.categories.delete(id);
  });
}

export async function countExpensesInCategory(id: string): Promise<number> {
  return db.expenses.where('categoryId').equals(id).count();
}

// --- 予定の種類 ---

export async function addItemKind(def: Omit<ItemKindDef, 'id' | 'order'>): Promise<string> {
  const id = `kind-${newId()}`;
  const last = await db.itemKinds.orderBy('order').last();
  await db.itemKinds.add({ ...def, id, order: (last?.order ?? -1) + 1 });
  return id;
}

export async function updateItemKind(id: string, patch: Partial<Omit<ItemKindDef, 'id'>>): Promise<void> {
  await db.itemKinds.update(id, patch);
}

/** 種類を消す。使っていた予定は「その他」に移す */
export async function deleteItemKind(id: string): Promise<void> {
  if (LOCKED_KINDS.has(id)) throw new Error('この種類は消せません');
  await db.transaction('rw', db.itemKinds, db.itineraryItems, async () => {
    await db.itineraryItems.filter((it) => it.kind === id).modify({ kind: OTHER_KIND });
    await db.itemKinds.delete(id);
  });
}

export async function countItemsOfKind(id: string): Promise<number> {
  return db.itineraryItems.filter((it) => it.kind === id).count();
}
