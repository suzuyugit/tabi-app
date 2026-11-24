import { db } from './db';
import type { Expense, PaymentMethod } from './types';
import { newId } from '../lib/id';

const LAST_PAYMENT_KEY = 'tabi.lastPaymentMethod';

/** 前回使った支払い方法（クイック入力の初期値） */
export function lastPaymentMethod(): PaymentMethod {
  try {
    const v = localStorage.getItem(LAST_PAYMENT_KEY);
    if (v === 'cash' || v === 'card' || v === 'paypay' || v === 'other') return v;
  } catch {
    // 使えない環境では初期値
  }
  return 'cash';
}

function rememberPaymentMethod(m: PaymentMethod) {
  try {
    localStorage.setItem(LAST_PAYMENT_KEY, m);
  } catch {
    // 覚えられなくても動作に影響はない
  }
}

export type ExpenseInput = Omit<Expense, 'id' | 'tripId'>;

/**
 * 支出を保存する（id があれば更新）。
 * - カテゴリの usageCount を +1（新規のとき、または編集でカテゴリを変えたとき）
 * - 精算表の「済み」チェックを外す（金額が変わるため）
 */
export async function saveExpense(tripId: string, input: ExpenseInput, id?: string): Promise<string> {
  const expenseId = id ?? newId();
  await db.transaction('rw', db.expenses, db.categories, db.settlements, async () => {
    const prev = id ? await db.expenses.get(id) : undefined;
    const e: Expense = { ...input, id: expenseId, tripId };
    if (e.splitMode !== 'custom') delete e.customShares;
    if (!e.itemId) delete e.itemId;
    if (!e.memo) delete e.memo;
    await db.expenses.put(e);
    if (!prev || prev.categoryId !== e.categoryId) {
      await db.categories
        .where('id')
        .equals(e.categoryId)
        .modify((c) => {
          c.usageCount += 1;
        });
    }
    await db.settlements.where('tripId').equals(tripId).delete();
  });
  rememberPaymentMethod(input.paymentMethod);
  return expenseId;
}

export async function deleteExpense(id: string): Promise<void> {
  await db.transaction('rw', db.expenses, db.settlements, async () => {
    const e = await db.expenses.get(id);
    if (!e) return;
    await db.expenses.delete(id);
    await db.settlements.where('tripId').equals(e.tripId).delete();
  });
}
