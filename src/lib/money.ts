import type { Expense, ItemKindDef, ItineraryItem, Trip } from '../db/types';
import { DEFAULT_ITEM_KINDS, OTHER_CATEGORY } from './kinds';
import { isoDate } from './datetime';
import { shareOf } from './split';
import { convert, JPY, tripCurrency } from './currency';

export type ViewMode = 'group' | 'me';

type TripMoney = Pick<Trip, 'members' | 'currency' | 'rate'>;

export function expenseCurrency(e: Pick<Expense, 'currency'>): string {
  return e.currency ?? JPY;
}

/** 表示モードでの、その支出の額（支払った通貨のまま）。グループ全体なら金額、自分なら自分の負担分 */
export function valueOf(e: Expense, mode: ViewMode, meId: string): number {
  return mode === 'group' ? e.amount : shareOf(e, meId);
}

/** 表示モードでの、その支出の額を表示通貨に換算したもの */
export function valueIn(e: Expense, mode: ViewMode, meId: string, display: string, trip: TripMoney): number {
  return convert(valueOf(e, mode, meId), expenseCurrency(e), display, trip);
}

export type MoneySummary = {
  total: number;
  byCategory: Map<string, number>;
  byDay: Map<string, number>;
};

/** 合計・カテゴリ別・日別（すべて表示通貨の最小単位） */
export function summarize(
  expenses: Expense[],
  mode: ViewMode,
  meId: string,
  display: string,
  trip: TripMoney & Pick<Trip, 'timeZone'>,
): MoneySummary {
  const byCategory = new Map<string, number>();
  const byDay = new Map<string, number>();
  let total = 0;
  for (const e of expenses) {
    const v = valueIn(e, mode, meId, display, trip);
    total += v;
    byCategory.set(e.categoryId, (byCategory.get(e.categoryId) ?? 0) + v);
    const day = isoDate(e.datetime, trip.timeZone); // 日付は現地の日付で分ける
    byDay.set(day, (byDay.get(day) ?? 0) + v);
  }
  return { total, byCategory, byDay };
}

/** 自分の負担分の合計（円）。予算（円）と比べるのに使う */
export function myTotal(trip: TripMoney, expenses: Expense[]): number {
  const me = trip.members.find((m) => m.isMe)?.id;
  if (!me) return 0;
  return expenses.reduce((a, e) => a + convert(shareOf(e, me), expenseCurrency(e), JPY, trip), 0);
}

/**
 * 現金の残り（現地通貨）= 出発時の手持ち − 自分が現地通貨の現金で払った額。
 * 手持ちが未設定なら undefined
 */
export function cashRemaining(
  trip: Pick<Trip, 'members' | 'currency' | 'cashOnHand'>,
  expenses: Expense[],
): { start: number; paid: number; rest: number; currency: string } | undefined {
  if (trip.cashOnHand === undefined) return undefined;
  const me = trip.members.find((m) => m.isMe)?.id;
  const local = tripCurrency(trip);
  const paid = expenses
    .filter((e) => e.paidBy === me && e.paymentMethod === 'cash' && expenseCurrency(e) === local)
    .reduce((a, e) => a + e.amount, 0);
  return { start: trip.cashOnHand, paid, rest: trip.cashOnHand - paid, currency: local };
}

/** 支出がまだひも付いていない、予想費用のある予定（＝これから使う見込みの予定） */
export function plannedItems<T extends Pick<ItineraryItem, 'id' | 'estimatedCost'>>(items: T[], expenses: Pick<Expense, 'itemId'>[]): T[] {
  const linked = new Set(expenses.map((e) => e.itemId).filter(Boolean));
  return items.filter((it) => it.estimatedCost !== undefined && it.estimatedCost > 0 && !linked.has(it.id));
}

/** 予定の予想費用（1人あたり）を表示通貨に換算 */
export function estimateIn(item: Pick<ItineraryItem, 'estimatedCost' | 'estimatedCurrency'>, display: string, trip: Pick<Trip, 'currency' | 'rate'>): number {
  return convert(item.estimatedCost ?? 0, item.estimatedCurrency ?? tripCurrency(trip), display, trip);
}

export type Forecast = {
  spent: number; // 使った額（自分の負担分）
  planned: number; // これからの予定の予想費用の合計
  total: number; // 見積もり = spent + planned
  plannedByDay: Map<string, number>;
  plannedByCategory: Map<string, number>; // カテゴリ ID ごとの、これからの予定の額
};

/** 旅行でいくら使うかの見積もり（自分の分・表示通貨） */
export function forecast(
  trip: Pick<Trip, 'members' | 'currency' | 'rate' | 'timeZone'>,
  expenses: Expense[],
  items: Pick<ItineraryItem, 'id' | 'date' | 'kind' | 'estimatedCost' | 'estimatedCurrency'>[],
  display: string,
  kinds: ItemKindDef[] = DEFAULT_ITEM_KINDS,
): Forecast {
  const me = trip.members.find((m) => m.isMe)?.id ?? '';
  const spent = summarize(expenses, 'me', me, display, trip).total;
  const plannedByDay = new Map<string, number>();
  const plannedByCategory = new Map<string, number>();
  let planned = 0;
  for (const it of plannedItems(items, expenses)) {
    const v = estimateIn(it, display, trip);
    planned += v;
    plannedByDay.set(it.date, (plannedByDay.get(it.date) ?? 0) + v);
    // 予定の種類に決めてあるカテゴリに入れる
    const cat = kinds.find((k) => k.id === it.kind)?.categoryId ?? OTHER_CATEGORY;
    plannedByCategory.set(cat, (plannedByCategory.get(cat) ?? 0) + v);
  }
  return { spent, planned, total: spent + planned, plannedByDay, plannedByCategory };
}
