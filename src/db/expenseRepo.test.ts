import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { deleteExpense, saveExpense, type ExpenseInput } from './expenseRepo';

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
});
