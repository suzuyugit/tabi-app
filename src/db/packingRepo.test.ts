import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { addPacking, togglePacking, uncheckAll } from './packingRepo';
import { setSettled, settledKeys } from './settlementRepo';
import { saveExpense } from './expenseRepo';

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

describe('精算の済みチェック', () => {
  it('金額が変わったら済みではない。支出を変えたら消える', async () => {
    const t = { from: 'b', to: 'a', amount: 500 };
    await setSettled('t', t, true);
    expect((await settledKeys('t', [t])).has('b>a')).toBe(true);
    expect((await settledKeys('t', [{ ...t, amount: 600 }])).size).toBe(0);
    await saveExpense('t', {
      amount: 100, categoryId: 'cat-03-food', paymentMethod: 'cash', datetime: '2026-12-01T12:00:00+09:00',
      paidBy: 'a', splitAmong: ['a', 'b'], splitMode: 'equal',
    });
    expect((await settledKeys('t', [t])).size).toBe(0);
  });
});
