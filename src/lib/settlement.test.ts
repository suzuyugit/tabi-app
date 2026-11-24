import { describe, expect, it } from 'vitest';
import { calcSettlement, memberBreakdown, settlementForTrip, transfersFrom } from './settlement';
import type { Expense } from '../db/types';

const members = [
  { id: 'suzuki', name: '鈴木', isMe: true },
  { id: 'sato', name: '佐藤', isMe: false },
  { id: 'tanaka', name: '田中', isMe: false },
];
const all = members.map((m) => m.id);
const ex = (amount: number, paidBy: string, extra: Partial<Expense> = {}) => ({
  amount,
  paidBy,
  splitAmong: all,
  splitMode: 'equal' as const,
  ...extra,
});

describe('calcSettlement', () => {
  it('SPEC の例：鈴木が宿代 30,000円、佐藤が夕食 9,000円', () => {
    const r = calcSettlement([ex(30000, 'suzuki'), ex(9000, 'sato')], members);
    expect(Object.fromEntries(r.balances.map((b) => [b.memberId, b.diff]))).toEqual({ suzuki: 17000, sato: -4000, tanaka: -13000 });
    expect(r.transfers).toEqual([
      { from: 'tanaka', to: 'suzuki', amount: 13000 },
      { from: 'sato', to: 'suzuki', amount: 4000 },
    ]);
    // 立て替えた額・負担する額
    const suzuki = r.balances.find((b) => b.memberId === 'suzuki')!;
    expect([suzuki.paid, suzuki.owed]).toEqual([30000, 13000]);
  });

  it('割り切れない端数は払った人がかぶる', () => {
    const r = calcSettlement([ex(1000, 'suzuki')], members);
    expect(Object.fromEntries(r.balances.map((b) => [b.memberId, b.diff]))).toEqual({ suzuki: 666, sato: -333, tanaka: -333 });
  });

  it('金額を指定・一部の人だけで割る', () => {
    const r = calcSettlement(
      [
        ex(5000, 'sato', { splitMode: 'custom', customShares: { suzuki: 3000, sato: 2000 }, splitAmong: ['suzuki', 'sato'] }),
        ex(2000, 'tanaka', { splitAmong: ['tanaka', 'suzuki'] }),
      ],
      members,
    );
    expect(r.transfers).toEqual([
      { from: 'suzuki', to: 'sato', amount: 3000 },
      { from: 'suzuki', to: 'tanaka', amount: 1000 },
    ]);
  });

  it('全員の差額が 0 なら送金なし', () => {
    expect(calcSettlement([ex(3000, 'suzuki', { splitAmong: ['suzuki'] })], members).transfers).toEqual([]);
    expect(transfersFrom([])).toEqual([]);
  });
});

describe('settlementForTrip（円と現地通貨が混ざる）', () => {
  it('通貨ごとに差額を出して円にそろえる', () => {
    const trip = { members, currency: 'USD', rate: 150 };
    const r = settlementForTrip(trip, [
      ex(9000, 'suzuki', { currency: 'USD' }), // $90 → 13,500円（1人 $30 = 4,500円）
      ex(30000, 'sato'), // 30,000円（1人 10,000円）
    ]);
    const diff = Object.fromEntries(r.balances.map((b) => [b.memberId, b.diff]));
    expect(diff).toEqual({ suzuki: 13500 - 14500, sato: 30000 - 14500, tanaka: -14500 });
    expect(r.balances.reduce((a, b) => a + b.diff, 0)).toBe(0);
  });

  it('換算の端数があっても差額の合計は 0', () => {
    const trip = { members, currency: 'USD', rate: 151.37 };
    const r = settlementForTrip(trip, [ex(1001, 'suzuki', { currency: 'USD' }), ex(333, 'tanaka', { currency: 'USD' })]);
    expect(r.balances.reduce((a, b) => a + b.diff, 0)).toBe(0);
  });
});

describe('一部だけ返す', () => {
  const trip = { members };
  const list = [ex(30000, 'suzuki'), ex(9000, 'sato')];
  it('返した分を引いた残りで精算表を作る', () => {
    const r = settlementForTrip(trip, list, [{ from: 'tanaka', to: 'suzuki', amount: 5000 }]);
    expect(r.transfers).toEqual([
      { from: 'tanaka', to: 'suzuki', amount: 8000 },
      { from: 'sato', to: 'suzuki', amount: 4000 },
    ]);
    const tanaka = r.balances.find((b) => b.memberId === 'tanaka')!;
    expect([tanaka.sent, tanaka.diff]).toEqual([5000, -8000]);
  });
  it('全額返せば、その行は消える', () => {
    const r = settlementForTrip(trip, list, [
      { from: 'tanaka', to: 'suzuki', amount: 13000 },
      { from: 'sato', to: 'suzuki', amount: 4000 },
    ]);
    expect(r.transfers).toEqual([]);
  });
});

describe('memberBreakdown', () => {
  it('立て替えた支出と、負担する支出（割り勘だけ）', () => {
    const base = { currency: undefined, categoryId: 'c', memo: undefined as string | undefined };
    const exps = [
      { ...ex(30000, 'suzuki'), ...base, id: 'e1', datetime: '2026-12-01T15:00:00+09:00', memo: '宿' },
      { ...ex(9000, 'sato'), ...base, id: 'e2', datetime: '2026-12-01T19:00:00+09:00', memo: '夕食' },
      { ...ex(800, 'tanaka', { splitAmong: ['tanaka'] }), ...base, id: 'e3', datetime: '2026-12-01T20:00:00+09:00', memo: '個人' },
    ];
    const b = memberBreakdown({}, exps, 'tanaka', (e) => e.memo ?? '');
    expect(b.advanced).toEqual([]);
    expect(b.owes.map((l) => [l.title, l.share, l.payer])).toEqual([
      ['宿', 10000, 'suzuki'],
      ['夕食', 3000, 'sato'],
    ]);
    const s = memberBreakdown({}, exps, 'suzuki', (e) => e.memo ?? '');
    expect(s.advanced.map((l) => [l.title, l.amount, l.share, l.others])).toEqual([['宿', 30000, 10000, 20000]]);
  });
});

describe('個人の支出', () => {
  it('精算の立て替え・負担の額に入れない', () => {
    const r = settlementForTrip({ members }, [ex(30000, 'suzuki'), ex(800, 'suzuki', { splitAmong: ['suzuki'] })]);
    const suzuki = r.balances.find((b) => b.memberId === 'suzuki')!;
    expect([suzuki.paid, suzuki.owed, suzuki.diff]).toEqual([30000, 10000, 20000]);
  });
});
