import type { Expense, Trip } from '../db/types';
import { isoDate } from './datetime';
import { shareOf } from './split';

export type ViewMode = 'group' | 'me';

/** 表示モードでの、その支出の額（グループ全体なら金額、自分なら自分の負担分） */
export function valueOf(e: Expense, mode: ViewMode, meId: string): number {
  return mode === 'group' ? e.amount : shareOf(e, meId);
}

export type MoneySummary = {
  total: number;
  byCategory: Map<string, number>;
  byDay: Map<string, number>;
};

export function summarize(expenses: Expense[], mode: ViewMode, meId: string): MoneySummary {
  const byCategory = new Map<string, number>();
  const byDay = new Map<string, number>();
  let total = 0;
  for (const e of expenses) {
    const v = valueOf(e, mode, meId);
    total += v;
    byCategory.set(e.categoryId, (byCategory.get(e.categoryId) ?? 0) + v);
    const day = isoDate(e.datetime);
    byDay.set(day, (byDay.get(day) ?? 0) + v);
  }
  return { total, byCategory, byDay };
}

/** 自分の負担分の合計（予算と比べる額） */
export function myTotal(trip: Pick<Trip, 'members'>, expenses: Expense[]): number {
  const me = trip.members.find((m) => m.isMe)?.id;
  return me ? expenses.reduce((a, e) => a + shareOf(e, me), 0) : 0;
}

/** 現金の残り = 出発時の手持ち − 自分が現金で払った額。手持ちが未設定なら undefined */
export function cashRemaining(trip: Trip, expenses: Expense[]): { start: number; paid: number; rest: number } | undefined {
  if (trip.cashOnHand === undefined) return undefined;
  const me = trip.members.find((m) => m.isMe)?.id;
  const paid = expenses.filter((e) => e.paidBy === me && e.paymentMethod === 'cash').reduce((a, e) => a + e.amount, 0);
  return { start: trip.cashOnHand, paid, rest: trip.cashOnHand - paid };
}
