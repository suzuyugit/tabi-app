import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { TabiDB } from './db';

describe('DB の v1 → v2 移行', () => {
  it('place を places に移し、kind を付ける', async () => {
    const name = 'tabi-migration-test';
    const old = new Dexie(name);
    old.version(1).stores({
      trips: 'id, startDate, endDate',
      itineraryItems: 'id, tripId, [tripId+date]',
      expenses: 'id, tripId, categoryId, datetime',
      packingItems: 'id, tripId',
      categories: 'id, usageCount',
      settlements: '[tripId+from+to], tripId',
    });
    await old.table('itineraryItems').bulkAdd([
      { id: 'a', tripId: 't', date: '2026-12-01', title: '清水寺', place: '清水寺 京都', order: 0 },
      { id: 'b', tripId: 't', date: '2026-12-01', title: '集合', order: 1 },
    ]);
    old.close();

    const db = new TabiDB(name);
    const items = await db.itineraryItems.orderBy('id').toArray();
    expect(items.map((i) => [i.kind, i.places, 'place' in i])).toEqual([
      ['other', ['清水寺 京都'], false],
      ['other', [], false],
    ]);
    db.close();
  });
});

describe('DB の v5 → v6 移行', () => {
  it('今ある現地通貨の支出に、その旅行の今のレートを入れる', async () => {
    const name = 'tabi-migration-v6-test';
    const old = new Dexie(name);
    old.version(5).stores({
      trips: 'id, startDate, endDate',
      itineraryItems: 'id, tripId, [tripId+date]',
      expenses: 'id, tripId, categoryId, datetime',
      packingItems: 'id, tripId',
      categories: 'id, usageCount',
      repayments: 'id, tripId',
      itemKinds: 'id, order',
      packingLists: 'id, name',
    });
    await old.table('trips').bulkAdd([
      { id: 't', name: 'ソウル', currency: 'KRW', rate: 0.11 },
      { id: 'n', name: 'レートなし', currency: 'USD' },
    ]);
    await old.table('expenses').bulkAdd([
      { id: 'a', tripId: 't', amount: 1000, currency: 'KRW' },
      { id: 'b', tripId: 't', amount: 1000 }, // 円
      { id: 'c', tripId: 'n', amount: 1000, currency: 'USD' },
    ]);
    old.close();

    const db = new TabiDB(name);
    const ex = await db.expenses.orderBy('id').toArray();
    expect(ex.map((e) => [e.id, e.rateAtRecord])).toEqual([
      ['a', 0.11],
      ['b', undefined],
      ['c', undefined],
    ]);
    db.close();
  });
});
