import { describe, expect, it } from 'vitest';
import { datesLabel, defaultCount, lineAmount, planByCategory, planTotal } from './plan';
import type { PlanLine } from '../db/types';

const trip = { startDate: '2026-12-01', endDate: '2026-12-05', currency: 'USD', rate: 150 };
const lines: PlanLine[] = [
  { id: '1', categoryId: 'food', amount: 5000, unit: 'day', count: 5 }, // 食費 5,000円 × 5日
  { id: '2', categoryId: 'move', amount: 2000, unit: 'day', count: 5 }, // 移動 2,000円 × 5日
  { id: '3', categoryId: 'hotel', amount: 8000, unit: 'night', count: 4 }, // 宿 8,000円 × 4泊
  { id: '4', categoryId: 'food', amount: 3000, currency: 'USD', unit: 'once', count: 1 }, // ディナー $30 一括
];

describe('見積もりプラン', () => {
  it('回数の初期値：日数・泊数', () => {
    expect(defaultCount('day', trip)).toBe(5);
    expect(defaultCount('night', trip)).toBe(4);
    expect(defaultCount('time', trip)).toBe(1);
    expect(defaultCount('night', { startDate: '2026-12-01', endDate: '2026-12-01' })).toBe(1);
  });
  it('合計とカテゴリ別（円で）', () => {
    expect(lineAmount(lines[0])).toBe(25000);
    expect(lineAmount({ amount: 9000, unit: 'once', count: 3 })).toBe(9000); // 一括は回数を見ない
    expect(planTotal(lines, 'JPY', trip)).toBe(25000 + 10000 + 32000 + 4500);
    expect(planByCategory(lines, 'JPY', trip).get('food')).toBe(25000 + 4500);
  });

  it('日付の表示：続く日はまとめる', () => {
    expect(datesLabel(['2026-11-27', '2026-11-25', '2026-11-26', '2026-11-29'])).toBe('11/25〜11/27・11/29');
    expect(datesLabel(['2026-12-31', '2027-01-01'])).toBe('12/31〜1/1');
    expect(datesLabel([])).toBe('');
  });
});
