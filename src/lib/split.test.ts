import { describe, expect, it } from 'vitest';
import { sharesOf, validateExpense } from './split';
import { budgetFor, cashRemaining, summarize } from './money';
import type { Expense, Trip } from '../db/types';

const base = { paidBy: 'a', splitAmong: ['a', 'b', 'c'], splitMode: 'equal' as const };

describe('sharesOf', () => {
  it('均等：端数は払った人', () => {
    expect(sharesOf({ ...base, amount: 1000 })).toEqual({ a: 334, b: 333, c: 333 });
    expect(sharesOf({ ...base, amount: 1000, paidBy: 'b' })).toEqual({ a: 333, b: 334, c: 333 });
  });
  it('均等：払った人が割る人に入っていなくても合計は金額どおり', () => {
    const s = sharesOf({ ...base, amount: 1000, paidBy: 'd', splitAmong: ['a', 'b', 'c'] });
    expect(s).toEqual({ a: 333, b: 333, c: 333, d: 1 });
  });
  it('金額を指定', () => {
    expect(sharesOf({ ...base, amount: 1000, splitMode: 'custom', customShares: { a: 600, b: 400 }, splitAmong: ['a', 'b'] })).toEqual({ a: 600, b: 400 });
  });
});

describe('validateExpense', () => {
  const ids = ['a', 'b', 'c'];
  const ok = { ...base, amount: 900, categoryId: 'cat' };
  it('OK', () => expect(validateExpense(ok, ids)).toBeUndefined());
  it('金額・カテゴリ・割る人', () => {
    expect(validateExpense({ ...ok, amount: 0 }, ids)).toMatch('金額');
    expect(validateExpense({ ...ok, categoryId: '' }, ids)).toMatch('カテゴリ');
    expect(validateExpense({ ...ok, splitAmong: [] }, ids)).toMatch('割る人');
  });
  it('金額を指定：合計が合わないと保存できない', () => {
    const c = { ...ok, splitMode: 'custom' as const, splitAmong: ['a', 'b'] };
    expect(validateExpense({ ...c, customShares: { a: 500, b: 300 } }, ids)).toMatch('合っていません');
    expect(validateExpense({ ...c, customShares: { a: 600, b: 300 } }, ids)).toBeUndefined();
  });
});

describe('money', () => {
  const trip: Trip = {
    id: 't', name: 'x', startDate: '2026-12-01', endDate: '2026-12-02', budget: 90000, cashOnHand: 20000, createdAt: '',
    members: [{ id: 'a', name: 'A', isMe: true }, { id: 'b', name: 'B', isMe: false }, { id: 'c', name: 'C', isMe: false }],
  };
  const ex = (id: string, amount: number, paidBy: string, pm: Expense['paymentMethod'], dt: string, cat = 'food'): Expense => ({
    id, tripId: 't', amount, categoryId: cat, paymentMethod: pm, datetime: dt, paidBy, splitAmong: ['a', 'b', 'c'], splitMode: 'equal',
  });
  const list = [
    ex('1', 30000, 'a', 'card', '2026-12-01T15:00:00+09:00', 'hotel'),
    ex('2', 9000, 'b', 'cash', '2026-12-01T19:00:00+09:00'),
    ex('3', 1500, 'a', 'cash', '2026-12-02T10:00:00+09:00'),
  ];
  it('グループ全体と自分の負担分', () => {
    const g = summarize(list, 'group', 'a');
    expect(g.total).toBe(40500);
    expect(g.byCategory.get('food')).toBe(10500);
    const m = summarize(list, 'me', 'a');
    expect(m.total).toBe(10000 + 3000 + 500);
  });
  it('予算：自分は人数で割る', () => {
    expect(budgetFor(trip, 'group')).toBe(90000);
    expect(budgetFor(trip, 'me')).toBe(30000);
  });
  it('現金の残り：自分が現金で払った分だけ減る', () => {
    expect(cashRemaining(trip, list)).toEqual({ start: 20000, paid: 1500, rest: 18500 });
    expect(cashRemaining({ ...trip, cashOnHand: undefined }, list)).toBeUndefined();
  });
});
