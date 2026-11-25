import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { deleteExpense, rateToRecord, saveExpense, type ExpenseInput } from './expenseRepo';

const input: ExpenseInput = {
  amount: 1200, categoryId: 'cat-03-food', paymentMethod: 'cash', datetime: '2026-12-01T12:00:00+09:00',
  paidBy: 'a', splitAmong: ['a', 'b'], splitMode: 'equal',
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('expenseRepo', () => {
  it('保存でカテゴリの usageCount が増える', async () => {
    const id = await saveExpense('t', input);
    expect((await db.categories.get('cat-03-food'))!.usageCount).toBe(1);
    // 同じカテゴリのまま編集しても増えない。カテゴリを変えると変えた先が増える
    await saveExpense('t', { ...input, amount: 1300 }, id);
    expect((await db.categories.get('cat-03-food'))!.usageCount).toBe(1);
    await saveExpense('t', { ...input, categoryId: 'cat-04-cafe' }, id);
    expect((await db.categories.get('cat-04-cafe'))!.usageCount).toBe(1);
    expect(await db.expenses.count()).toBe(1);
  });

  it('均等のときは customShares を残さない／削除', async () => {
    const id = await saveExpense('t', { ...input, customShares: { a: 1, b: 2 } });
    expect((await db.expenses.get(id))!.customShares).toBeUndefined();
    await deleteExpense(id);
    expect(await db.expenses.count()).toBe(0);
  });

  it('現地通貨の支出には記録したときのレートを持たせ、編集しても変えない', async () => {
    await db.trips.put({ id: 't', name: 'ソウル', startDate: '2026-12-01', endDate: '2026-12-03', budget: 0, members: [], currency: 'KRW', rate: 0.1, createdAt: '' });
    const id = await saveExpense('t', { ...input, currency: 'KRW' });
    expect((await db.expenses.get(id))!.rateAtRecord).toBe(0.1);
    // 旅行のレートを変えたあとに編集しても、記録したときのレートのまま
    await db.trips.update('t', { rate: 0.12 });
    await saveExpense('t', { ...input, currency: 'KRW', amount: 5000 }, id);
    expect((await db.expenses.get(id))!.rateAtRecord).toBe(0.1);
    // 円に切り替えるとなくなり、現地通貨に戻すとその時点のレート
    await saveExpense('t', { ...input }, id);
    expect((await db.expenses.get(id))!.rateAtRecord).toBeUndefined();
    await saveExpense('t', { ...input, currency: 'KRW' }, id);
    expect((await db.expenses.get(id))!.rateAtRecord).toBe(0.12);
  });

  it('rateToRecord', () => {
    expect(rateToRecord({}, undefined, 0.1)).toBeUndefined();
    expect(rateToRecord({ currency: 'JPY' }, undefined, 0.1)).toBeUndefined();
    expect(rateToRecord({ currency: 'USD' }, undefined, 150)).toBe(150);
    expect(rateToRecord({ currency: 'USD' }, { currency: 'USD', rateAtRecord: 140 }, 150)).toBe(140);
    expect(rateToRecord({ currency: 'USD' }, { currency: 'JPY' }, 150)).toBe(150);
    expect(rateToRecord({ currency: 'USD' }, undefined, undefined)).toBeUndefined();
  });
});
