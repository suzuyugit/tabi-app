import type { Expense, PaymentMethod, RoundMode } from '../db/types';
import { currencyInfo, formatMoney } from './currency';

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: '現金',
  card: 'カード',
  paypay: 'PayPay',
  other: 'その他',
};
export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'paypay', 'other'];

type SplitPart = Pick<Expense, 'amount' | 'paidBy' | 'splitAmong' | 'splitMode' | 'customShares' | 'roundUnit' | 'roundMode'> & {
  currency?: string;
};

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
  // ざっくり：払った人以外をきりのいい額にそろえ、ずれは払った人が持つ（払った人が割る人に入っているときだけ）
  if (e.roundUnit && e.roundUnit > 1 && e.splitAmong.includes(e.paidBy)) {
    const each = roundTo(e.amount / n, e.roundUnit, e.roundMode ?? 'nearest');
    const others = e.splitAmong.filter((id) => id !== e.paidBy);
    const payerShare = e.amount - each * others.length;
    if (payerShare >= 0) {
      for (const id of others) shares[id] = each;
      shares[e.paidBy] = payerShare;
      return shares;
    }
    // 払った人の負担がマイナスになるほど小さい金額なら、ざっくりにしない
  }
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
    if (values.some((v) => !Number.isInteger(v) || v < 0)) return '負担額を正しく入れてください';
    const sum = values.reduce((a, b) => a + b, 0);
    if (sum !== e.amount) return `負担額の合計（${formatMoney(sum, e.currency)}）が金額と合っていません`;
  }
  return undefined;
}

/** value を unit 単位に丸める */
export function roundTo(value: number, unit: number, mode: RoundMode): number {
  const q = value / unit;
  const r = mode === 'up' ? Math.ceil(q - 1e-9) : mode === 'down' ? Math.floor(q + 1e-9) : Math.round(q);
  return r * unit;
}

/** ざっくりの単位の候補（その通貨の最小単位で）。円は 10/100/1000円、ウォンなどは 100/1000/10000、ドルなどは 1/5/10 */
export function roundUnitsFor(code: string | undefined): { unit: number; label: string }[] {
  const c = currencyInfo(code);
  const majors = c.decimals > 0 ? [1, 5, 10] : c.code === 'JPY' || c.code === 'TWD' ? [10, 100, 1000] : [100, 1000, 10000];
  return majors.map((m) => ({ unit: m * 10 ** c.decimals, label: formatMoney(m * 10 ** c.decimals, c.code) }));
}

export const ROUND_MODE_LABEL: Record<RoundMode, string> = { up: '切り上げ', nearest: '四捨五入', down: '切り捨て' };
