import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { addPacking, togglePacking, uncheckAll } from './packingRepo';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('持ち物', () => {
  it('追加・チェック・全部外す', async () => {
    await addPacking('t', '充電器');
    await addPacking('t', '傘');
    const items = await db.packingItems.where('tripId').equals('t').sortBy('order');
    expect(items.map((p) => [p.name, p.order])).toEqual([
      ['充電器', 0],
      ['傘', 1],
    ]);
    await togglePacking(items[0].id);
    expect((await db.packingItems.get(items[0].id))!.checked).toBe(true);
    await uncheckAll('t');
    expect((await db.packingItems.toArray()).every((p) => !p.checked)).toBe(true);
  });
});

