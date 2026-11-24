import Dexie, { type EntityTable, type Table } from 'dexie';
import type { Category, Expense, ItineraryItem, PackingItem, Settlement, Trip } from './types';

// ID の数字は usageCount が同じときの並び順（初期値の順）
export const DEFAULT_CATEGORIES: Omit<Category, 'usageCount'>[] = [
  { id: 'cat-01-transport', name: '交通', icon: '🚃' },
  { id: 'cat-02-hotel', name: '宿', icon: '🏨' },
  { id: 'cat-03-food', name: '食事', icon: '🍚' },
  { id: 'cat-04-cafe', name: 'カフェ・おやつ', icon: '☕' },
  { id: 'cat-05-sightseeing', name: '観光', icon: '📸' },
  { id: 'cat-06-souvenir', name: 'お土産', icon: '🎁' },
  { id: 'cat-07-other', name: 'その他', icon: '📦' },
];

export class TabiDB extends Dexie {
  trips!: EntityTable<Trip, 'id'>;
  itineraryItems!: EntityTable<ItineraryItem, 'id'>;
  expenses!: EntityTable<Expense, 'id'>;
  packingItems!: EntityTable<PackingItem, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  // 主キーは [tripId+from+to] の複合キー
  settlements!: Table<Settlement, [string, string, string]>;

  constructor(name = 'tabi-app') {
    super(name);
    this.version(1).stores({
      trips: 'id, startDate, endDate',
      itineraryItems: 'id, tripId, [tripId+date]',
      expenses: 'id, tripId, categoryId, datetime',
      packingItems: 'id, tripId',
      categories: 'id, usageCount',
      settlements: '[tripId+from+to], tripId',
    });

    // 初回作成時だけカテゴリの初期値を入れる
    this.on('populate', (tx) => {
      tx.table('categories').bulkAdd(DEFAULT_CATEGORIES.map((c) => ({ ...c, usageCount: 0 })));
    });
  }
}

export const db = new TabiDB();
