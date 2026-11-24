import { describe, expect, it } from 'vitest';
import { sharesOf, validateExpense } from './split';
import { cashRemaining, myTotal, summarize } from './money';
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
    const g = summarize(list, 'group', 'a', 'JPY', trip);
    expect(g.total).toBe(40500);
    expect(g.byCategory.get('food')).toBe(10500);
    const m = summarize(list, 'me', 'a', 'JPY', trip);
    expect(m.total).toBe(10000 + 3000 + 500);
  });
  it('予算と比べる額は自分の負担分の合計', () => {
    expect(myTotal(trip, list)).toBe(10000 + 3000 + 500);
  });
  it('現金の残り：自分が現金で払った分だけ減る', () => {
    expect(cashRemaining(trip, list)).toEqual({ start: 20000, paid: 1500, rest: 18500, currency: 'JPY' });
    expect(cashRemaining({ ...trip, cashOnHand: undefined }, list)).toBeUndefined();
  });

  it('海外：円と現地通貨が混ざっていても換算して合計する', () => {
    const usd: Trip = { ...trip, currency: 'USD', rate: 150, cashOnHand: 20000 }; // 手持ち $200
    const mixed: Expense[] = [
      { ...ex('1', 3000, 'a', 'cash', '2026-12-01T12:00:00+09:00'), currency: 'USD' }, // $30（現地の現金）
      { ...ex('2', 45000, 'b', 'card', '2026-12-01T15:00:00+09:00', 'hotel') }, // 45,000円（日本で予約）
      { ...ex('3', 1500, 'a', 'cash', '2026-12-01T09:00:00+09:00') }, // 1,500円の現金（日本の空港）
    ];
    // 円で見る：$30 = 4,500円
    expect(summarize(mixed, 'group', 'a', 'JPY', usd).total).toBe(4500 + 45000 + 1500);
    // ドルで見る（セント）：45,000円 = $300、1,500円 = $10
    expect(summarize(mixed, 'group', 'a', 'USD', usd).total).toBe(3000 + 30000 + 1000);
    // 自分の負担（円）：$10 → 1,500円、15,000円、500円
    expect(myTotal(usd, mixed)).toBe(1500 + 15000 + 500);
    // 現金の残りは現地通貨の現金だけ減る：$200 − $30
    expect(cashRemaining(usd, mixed)).toEqual({ start: 20000, paid: 3000, rest: 17000, currency: 'USD' });
  });
});
