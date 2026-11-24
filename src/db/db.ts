import Dexie, { type EntityTable } from 'dexie';
import type { Category, Expense, ItineraryItem, PackingItem, Repayment, Trip } from './types';

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
  repayments!: EntityTable<Repayment, 'id'>;

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

    // v2：予定に種類（kind）を追加し、場所を1つ（place）から複数（places）にした
    this.version(2)
      .stores({})
      .upgrade((tx) =>
        tx
          .table('itineraryItems')
          .toCollection()
          .modify((it: Record<string, unknown>) => {
            const place = typeof it.place === 'string' ? it.place.trim() : '';
            it.places = place ? [place] : [];
            delete it.place;
            if (!it.kind) it.kind = 'other';
          }),
      );

    // v3：精算の「済み」チェック（settlements）をやめ、返したお金の記録（repayments）にした
    this.version(3).stores({ settlements: null, repayments: 'id, tripId' });

    // 初回作成時だけカテゴリの初期値を入れる
    this.on('populate', (tx) => {
      tx.table('categories').bulkAdd(DEFAULT_CATEGORIES.map((c) => ({ ...c, usageCount: 0 })));
    });
  }
}

export const db = new TabiDB();
