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
