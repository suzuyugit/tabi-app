// 見積もりプラン（「食費 1日5,000円 × 5日」のような予算の内訳）
import type { PlanLine, Trip } from '../db/types';
import { convert, JPY } from './currency';
import { dayCount } from './date';
import { addDays } from './itinerary';

export const PLAN_UNITS: { key: PlanLine['unit']; label: string; per: string; count: string }[] = [
  { key: 'day', label: '1日あたり', per: '1日', count: '日' },
  { key: 'night', label: '1泊あたり', per: '1泊', count: '泊' },
  { key: 'time', label: '1回あたり', per: '1回', count: '回' },
  { key: 'once', label: '一括', per: '', count: '' },
];

export function unitMeta(u: PlanLine['unit']) {
  return PLAN_UNITS.find((x) => x.key === u)!;
}

/** 単位ごとの回数の初期値（1日あたり＝旅行の日数、1泊あたり＝泊数） */
export function defaultCount(unit: PlanLine['unit'], trip: Pick<Trip, 'startDate' | 'endDate'>): number {
  const days = Math.max(1, dayCount(trip.startDate, trip.endDate));
  if (unit === 'day') return days;
  if (unit === 'night') return Math.max(1, days - 1);
  return 1;
}

/** 1行の合計（その行の通貨のまま） */
export function lineAmount(l: Pick<PlanLine, 'amount' | 'unit' | 'count'>): number {
  return l.unit === 'once' ? l.amount : l.amount * l.count;
}

/** 1行の合計を表示通貨に */
export function lineIn(l: PlanLine, display: string, trip: Pick<Trip, 'currency' | 'rate'>): number {
  return convert(lineAmount(l), l.currency ?? JPY, display, trip);
}

export function planTotal(lines: PlanLine[], display: string, trip: Pick<Trip, 'currency' | 'rate'>): number {
  return lines.reduce((a, l) => a + lineIn(l, display, trip), 0);
}

/** カテゴリごとの見積もり（表示通貨） */
export function planByCategory(lines: PlanLine[], display: string, trip: Pick<Trip, 'currency' | 'rate'>): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lines) m.set(l.categoryId, (m.get(l.categoryId) ?? 0) + lineIn(l, display, trip));
  return m;
}

/** 日付の一覧を短く：「11/25〜11/27・11/29」（続いている日はまとめる） */
export function datesLabel(dates: string[]): string {
  const sorted = [...new Set(dates)].sort();
  const parts: string[] = [];
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && addDays(sorted[j], 1) === sorted[j + 1]) j++;
    parts.push(j === i ? md(sorted[i]) : `${md(sorted[i])}〜${md(sorted[j])}`);
    i = j + 1;
  }
  return parts.join('・');
}
