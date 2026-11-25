// 旅行のまとめ（SPEC「便利機能」）
import type { Expense, Repayment, Trip } from '../db/types';
import { JPY } from './currency';
import { dayCount } from './date';
import { convertExpense, myTotal, summarize } from './money';
import { settlementForTrip, settleCurrencyOf } from './settlement';

export type TripSummary = {
  days: number;
  total: number; // 記録した支出の総額（円）
  perPerson: number; // 総額 ÷ 人数（円）
  mine: number; // 自分の負担分（円）
  minePerDay: number;
  budgetDiff?: number; // 予算 − 自分の負担分（プラス = 予算内）
  byCategory: { id: string; value: number }[]; // 自分の負担分（円）多い順
  top?: { expense: Expense; yen: number }; // いちばん高かった支出（円で比べる）
  expenseCount: number;
  remainingTransfers: number; // まだ済んでいない精算の件数
};

export function summarizeTrip(trip: Trip, expenses: Expense[], repayments: Repayment[]): TripSummary {
  const me = trip.members.find((m) => m.isMe)?.id ?? '';
  const days = Math.max(1, dayCount(trip.startDate, trip.endDate));
  const yenOf = (e: Expense) => convertExpense(e.amount, e, JPY, trip);
  const total = expenses.reduce((a, e) => a + yenOf(e), 0);
  const mine = myTotal(trip, expenses);
  const cat = summarize(expenses, 'me', me, JPY, trip).byCategory;
  let top: TripSummary['top'];
  for (const e of expenses) {
    const y = yenOf(e);
    if (!top || y > top.yen) top = { expense: e, yen: y };
  }
  const settle = settlementForTrip(trip, expenses, repayments, settleCurrencyOf(trip));
  return {
    days,
    total,
    perPerson: trip.members.length > 0 ? Math.round(total / trip.members.length) : total,
    mine,
    minePerDay: Math.round(mine / days),
    budgetDiff: trip.budget > 0 ? trip.budget - mine : undefined,
    byCategory: [...cat.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([id, value]) => ({ id, value })),
    top,
    expenseCount: expenses.length,
    remainingTransfers: settle.transfers.length,
  };
}
