import { createContext, useContext } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Category, ItemKindDef } from '../db/types';
import { DEFAULT_ITEM_KINDS } from '../lib/kinds';

/** 予定の種類（並び順）。読み込み中は最初から入っている種類 */
export function useItemKinds(): ItemKindDef[] {
  return useLiveQuery(() => db.itemKinds.orderBy('order').toArray()) ?? DEFAULT_ITEM_KINDS;
}

/** 支出のカテゴリ（よく使う順。同じなら初期値の順） */
export function useCategories(): Category[] | undefined {
  return useLiveQuery(async () => {
    const all = await db.categories.toArray();
    return all.sort((a, b) => b.usageCount - a.usageCount || a.id.localeCompare(b.id));
  });
}

/** 旅程タブの中のカードに種類の一覧を渡すための入れ物（カードごとに読みに行かないように） */
export const KindsContext = createContext<ItemKindDef[]>(DEFAULT_ITEM_KINDS);

export function useKindsContext(): ItemKindDef[] {
  return useContext(KindsContext);
}
