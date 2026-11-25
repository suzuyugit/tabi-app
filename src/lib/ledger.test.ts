import { describe, expect, it } from 'vitest';
import type { Category, Expense, ItineraryItem, Trip } from '../db/types';
import { DEFAULT_ITEM_KINDS } from './kinds';
import { buildLedger, decodeLedger, encodeLedger, ledgerForTrip } from './ledger';

const cats: Category[] = [
  { id: 'cat-01-transport', name: '交通', icon: '🚃', usageCount: 0 },
  { id: 'cat-03-food', name: '食事', icon: '🍚', usageCount: 0 },
];

const trip: Trip = {
  id: 't1',
  name: 'ソウル',
  startDate: '2026-12-01',
  endDate: '2026-12-03',
  budget: 80000,
  members: [
    { id: 'me', name: '自分', isMe: true },
    { id: 'f', name: '友人', isMe: false },
  ],
  currency: 'KRW',
  rate: 0.12, // 今のレート（記録したあとで変えた）
  timeZone: 'Asia/Seoul',
  createdAt: '2026-11-01T00:00:00Z',
};

const base = { tripId: 't1', categoryId: 'cat-03-food', paymentMethod: 'card' as const, splitMode: 'equal' as const };

const expenses: Expense[] = [
  // 円で払った航空券（自分だけ）
  { ...base, id: 'e1', categoryId: 'cat-01-transport', amount: 30000, datetime: '2026-10-05T21:00:00+09:00', paidBy: 'me', splitAmong: ['me'] },
  // ウォンで割り勘。記録したときのレートは 0.1
  { ...base, id: 'e2', amount: 20000, currency: 'KRW', rateAtRecord: 0.1, datetime: '2026-12-01T19:00:00+09:00', paidBy: 'f', splitAmong: ['me', 'f'], memo: '焼肉' },
  // 自分が立て替えた、友人だけの負担 → 入れない
  { ...base, id: 'e3', amount: 5000, currency: 'KRW', rateAtRecord: 0.1, datetime: '2026-12-02T10:00:00+09:00', paidBy: 'me', splitAmong: ['f'] },
  // 日本時間では 12/2 0:30 だが、ソウルも同じ時差なので 12/2
  { ...base, id: 'e4', amount: 3333, currency: 'KRW', rateAtRecord: 0.1, datetime: '2026-12-02T00:30:00+09:00', paidBy: 'me', splitAmong: ['me'] },
];

const items: ItineraryItem[] = [
  { id: 'i1', tripId: 't1', date: '2026-12-03', title: '明洞で買い物', kind: 'shopping', places: [], estimatedCost: 100000, order: 0 },
];

describe('ledgerForTrip', () => {
  const r = ledgerForTrip(trip, expenses, items, DEFAULT_ITEM_KINDS, cats);

  it('自分の負担分だけを、記録したときのレートで円にする', () => {
    expect(r.entries.map((e) => [e.id, e.myShareYen, e.date])).toEqual([
      ['e1', 30000, '2026-10-05'],
      ['e2', 1000, '2026-12-01'], // 10,000ウォン × 0.1
      ['e4', 333, '2026-12-02'], // 333.3 → 四捨五入
    ]);
  });

  it('カテゴリ名・アイコン・メモが入る', () => {
    expect(r.entries[1]).toMatchObject({ categoryName: '食事', categoryIcon: '🍚', memo: '焼肉', paymentMethod: 'card' });
    expect(r.entries[0].memo).toBeUndefined();
  });

  it('旅行の予算・使った額・見積もり', () => {
    expect(r.trip).toMatchObject({ tripId: 't1', name: 'ソウル', budgetYen: 80000, spentYen: 31333 });
    // 見積もり = 使った額 + 予定の予想費用（100,000ウォン × 今のレート 0.12）
    expect(r.trip.estimateYen).toBe(31333 + 12000);
  });

  it('予算がない旅行は budgetYen を入れない', () => {
    expect(ledgerForTrip({ ...trip, budget: 0 }, [], [], DEFAULT_ITEM_KINDS, cats).trip.budgetYen).toBeUndefined();
  });

  it('レートを持っていない古い支出は、旅行の今のレートで換算する', () => {
    const old = { ...expenses[3], rateAtRecord: undefined };
    expect(ledgerForTrip(trip, [old], [], DEFAULT_ITEM_KINDS, cats).entries[0].myShareYen).toBe(400); // 3,333 × 0.12
  });
});

describe('buildLedger / encode / decode', () => {
  const p = buildLedger(
    {
      trips: [trip, { ...trip, id: 't0', name: '京都', startDate: '2026-11-01', endDate: '2026-11-02', currency: undefined, rate: undefined, timeZone: undefined }],
      expenses,
      items,
      kinds: DEFAULT_ITEM_KINDS,
      categories: cats,
    },
    '2026-11-25T10:00:00Z',
  );

  it('旅行は出発日の順。支出のない旅行も入る', () => {
    expect(p.trips.map((t) => [t.name, t.spentYen])).toEqual([
      ['京都', 0],
      ['ソウル', 31333],
    ]);
    expect(p.entries).toHaveLength(3);
    expect(p.exportedAt).toBe('2026-11-25T10:00:00Z');
  });

  it('文字列にして読み戻せる', () => {
    const text = encodeLedger(p);
    expect(text.split('\n')[0]).toBe('TABIMEMO-LEDGER');
    expect(decodeLedger(text)).toEqual(p);
  });

  it('ほかの文字列や知らない schema は読まない', () => {
    expect(decodeLedger('こんにちは')).toEqual({ error: 'not-ledger' });
    expect(decodeLedger('TABIMEMO-LEDGER\n{壊れた')).toEqual({ error: 'not-ledger' });
    expect(decodeLedger(`TABIMEMO-LEDGER\n${JSON.stringify({ ...p, schema: 2 })}`)).toEqual({ error: 'unknown-schema' });
  });
});
