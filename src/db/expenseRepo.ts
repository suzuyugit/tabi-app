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
 * 支出に持たせる「記録したときのレート」。
 * - 円の支出：なし
 * - 現地通貨の支出：前から現地通貨で、レートを持っていればそのまま（編集しても変えない）。
 *   新しく記録したとき・円から現地通貨に切り替えたときは、その時点の旅行のレート
 */
export function rateToRecord(
  e: Pick<Expense, 'currency'>,
  prev: Pick<Expense, 'currency' | 'rateAtRecord'> | undefined,
  tripRate: number | undefined,
): number | undefined {
  const cur = e.currency ?? 'JPY';
  if (cur === 'JPY') return undefined;
  if (prev && (prev.currency ?? 'JPY') === cur && prev.rateAtRecord) return prev.rateAtRecord;
  return tripRate && tripRate > 0 ? tripRate : undefined;
}

/**
 * 支出を保存する（id があれば更新）。
 * - カテゴリの usageCount を +1（新規のとき、または編集でカテゴリを変えたとき）
 */
export async function saveExpense(tripId: string, input: ExpenseInput, id?: string): Promise<string> {
  const expenseId = id ?? newId();
  await db.transaction('rw', db.expenses, db.categories, db.trips, async () => {
    const prev = id ? await db.expenses.get(id) : undefined;
    const e: Expense = { ...input, id: expenseId, tripId };
    const trip = await db.trips.get(tripId);
    const rate = rateToRecord(e, prev, trip?.rate);
    if (rate === undefined) delete e.rateAtRecord;
    else e.rateAtRecord = rate;
    if (e.splitMode !== 'custom') delete e.customShares;
    if (!e.roundUnit) {
      delete e.roundUnit;
      delete e.roundMode;
    }
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
  });
  rememberPaymentMethod(input.paymentMethod);
  return expenseId;
}

export async function deleteExpense(id: string): Promise<void> {
  await db.expenses.delete(id);
}
