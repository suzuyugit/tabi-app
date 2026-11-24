import type { Expense, PaymentMethod } from '../db/types';

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: '現金',
  card: 'カード',
  paypay: 'PayPay',
  other: 'その他',
};
export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'paypay', 'other'];

type SplitPart = Pick<Expense, 'amount' | 'paidBy' | 'splitAmong' | 'splitMode' | 'customShares'>;

/**
 * 支出1件について、各メンバーが負担する額。合計は必ず amount になる。
 * equal：amount ÷ 人数の切り捨て。割り切れない端数は払った人がかぶる。
 * custom：customShares の額そのまま。
 */
export function sharesOf(e: SplitPart): Record<string, number> {
  const shares: Record<string, number> = {};
  if (e.splitMode === 'custom') {
    for (const id of e.splitAmong) shares[id] = e.customShares?.[id] ?? 0;
    return shares;
  }
  const n = e.splitAmong.length;
  if (n === 0) return shares;
  const base = Math.floor(e.amount / n);
  for (const id of e.splitAmong) shares[id] = base;
  const rest = e.amount - base * n;
  if (rest > 0) shares[e.paidBy] = (shares[e.paidBy] ?? 0) + rest;
  return shares;
}

/** その人の負担額 */
export function shareOf(e: SplitPart, memberId: string): number {
  return sharesOf(e)[memberId] ?? 0;
}

/** 保存できるかのチェック。問題があればメッセージ、なければ undefined */
export function validateExpense(e: SplitPart & { categoryId: string }, memberIds: string[]): string | undefined {
  if (!Number.isInteger(e.amount) || e.amount <= 0) return '金額を入れてください';
  if (!e.categoryId) return 'カテゴリを選んでください';
  if (!memberIds.includes(e.paidBy)) return '払った人を選んでください';
  if (e.splitAmong.length === 0) return '割る人を1人以上選んでください';
  if (e.splitAmong.some((id) => !memberIds.includes(id))) return '割る人にメンバー以外が入っています';
  if (e.splitMode === 'custom') {
    const values = e.splitAmong.map((id) => e.customShares?.[id] ?? 0);
    if (values.some((v) => !Number.isInteger(v) || v < 0)) return '負担額は0以上の整数（円）にしてください';
    const sum = values.reduce((a, b) => a + b, 0);
    if (sum !== e.amount) return `負担額の合計（${sum.toLocaleString()}円）が金額と合っていません`;
  }
  return undefined;
}
