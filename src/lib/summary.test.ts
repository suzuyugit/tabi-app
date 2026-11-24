import { describe, expect, it } from 'vitest';
import { summarizeTrip } from './summary';
import type { Expense, Trip } from '../db/types';

const trip: Trip = {
  id: 't', name: '京都', startDate: '2026-12-01', endDate: '2026-12-03', budget: 30000, createdAt: '',
  members: [{ id: 'a', name: '鈴木', isMe: true }, { id: 'b', name: '佐藤', isMe: false }],
};
const ex = (id: string, amount: number, paidBy: string, splitAmong: string[], categoryId = 'food'): Expense => ({
  id, tripId: 't', amount, categoryId, paymentMethod: 'cash', datetime: '2026-12-01T12:00:00+09:00', paidBy, splitAmong, splitMode: 'equal',
});

describe('旅行のまとめ', () => {
  it('総額・一人あたり・自分の分・いちばん高い支出', () => {
    const s = summarizeTrip(trip, [ex('1', 20000, 'a', ['a', 'b'], 'hotel'), ex('2', 1500, 'a', ['a']), ex('3', 3000, 'b', ['a', 'b'])], []);
    expect(s.total).toBe(24500);
    expect(s.perPerson).toBe(12250);
    expect(s.mine).toBe(10000 + 1500 + 1500);
    expect(s.minePerDay).toBe(Math.round(13000 / 3));
    expect(s.budgetDiff).toBe(17000);
    expect(s.top?.expense.id).toBe('1');
    expect(s.byCategory.map((c) => c.id)).toEqual(['hotel', 'food']);
    expect(s.remainingTransfers).toBe(1);
  });
});
