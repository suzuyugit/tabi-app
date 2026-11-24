import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildListPayload, buildPayload, decodePayload, encodePayload, parsePayload, shareUrl, type TripPayload } from './share';
import { db } from '../db/db';
import { importShared } from '../db/shareRepo';
import { settlementForTrip } from './settlement';
import type { Expense, ItineraryItem, Trip } from '../db/types';

const trip: Trip = {
  id: 'trip-1', name: '京都', startDate: '2026-12-01', endDate: '2026-12-03', budget: 50000, cashOnHand: 20000, createdAt: '',
  members: [
    { id: 'suzuki', name: '鈴木', isMe: true },
    { id: 'sato', name: '佐藤', isMe: false },
    { id: 'tanaka', name: '田中', isMe: false },
  ],
};
const all = ['suzuki', 'sato', 'tanaka'];
const ex = (id: string, amount: number, paidBy: string, splitAmong = all): Expense => ({
  id, tripId: 'trip-1', amount, categoryId: 'cat-03-food', paymentMethod: 'cash', datetime: '2026-12-01T12:00:00+09:00', paidBy, splitAmong, splitMode: 'equal',
});
const items: ItineraryItem[] = [
  { id: 'i1', tripId: 'trip-1', date: '2026-12-01', time: '09:00', title: '清水寺', kind: 'sightseeing', places: ['清水寺'], order: 0 },
  { id: 'i2', tripId: 'trip-1', date: '2026-12-01', time: '18:00', title: '温泉', kind: 'kind-x', places: [], order: 1 },
];
const kinds = [{ id: 'kind-x', name: '温泉', icon: '♨️', order: 6, categoryId: 'cat-05-sightseeing' }, { id: 'sightseeing', name: '観光', icon: '📸', order: 2, categoryId: 'cat-05-sightseeing' }];
const expenses = [ex('e1', 30000, 'suzuki'), ex('e2', 9000, 'sato'), ex('e3', 800, 'suzuki', ['suzuki'])];
const data = { items, kinds, expenses, categories: [], repayments: [] };

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('共有リンク', () => {
  it('旅程：予算・手持ち現金は入れず、URL に入れて取り出すと同じ中身', () => {
    const p = buildPayload('itinerary', trip, data, '2026-12-01T00:00:00Z');
    expect(p.trip).not.toHaveProperty('budget');
    expect(p.trip).not.toHaveProperty('cashOnHand');
    expect(p.kinds!.map((k) => k.id).sort()).toEqual(['kind-x', 'sightseeing']);
    const url = shareUrl(p, 'https://example.github.io/tabi-app/');
    expect(url.startsWith('https://example.github.io/tabi-app/#share=')).toBe(true);
    expect(decodePayload(url.split('#share=')[1])).toEqual(p);
    expect(decodePayload('こわれた文字列')).toBeUndefined();
  });

  it('割り勘：個人の支出は入れない。受け取った側でも同じ精算表になる', () => {
    const p = buildPayload('settle', trip, data);
    expect(p.expenses!.map((e) => e.id)).toEqual(['e1', 'e2']);
    const back = decodePayload(encodePayload(p)) as TripPayload;
    const there = settlementForTrip(back.trip as Trip, back.expenses as Expense[], []);
    const here = settlementForTrip(trip, expenses, []);
    expect(there.transfers).toEqual(here.transfers);
  });

  it('取り込み：新しい旅行として保存。「あなた」を選び直す。上書きでも個人の支出は残す', async () => {
    const p1 = buildPayload('itinerary', trip, data);
    await importShared(p1, 'sato');
    const t = (await db.trips.get('trip-1'))!;
    expect(t.members.find((m) => m.isMe)!.id).toBe('sato');
    expect(t.budget).toBe(0);
    expect(await db.itineraryItems.where('tripId').equals('trip-1').count()).toBe(2);
    expect(await db.itemKinds.get('kind-x')).toBeDefined();

    // 佐藤の個人の支出を入れてから、割り勘を取り込む
    await db.expenses.add({ ...ex('mine', 500, 'sato', ['sato']) });
    await importShared(buildPayload('settle', trip, data), 'sato');
    const ids = (await db.expenses.where('tripId').equals('trip-1').toArray()).map((e) => e.id).sort();
    expect(ids).toEqual(['e1', 'e2', 'mine']);
    // もう一度取り込んでも増えない（上書き）
    await importShared(buildPayload('settle', trip, data), 'sato');
    expect(await db.expenses.count()).toBe(3);
  });

  it('持ち物リストだけ：旅行の情報は入れない。前の形のリンクも読める', () => {
    const p = buildListPayload('国内1泊セット', ['充電器', ' 傘 ', '', '充電器'], '2026-12-01T00:00:00Z');
    expect(p).toEqual({ v: 1, kind: 'packing', sharedAt: '2026-12-01T00:00:00Z', list: { name: '国内1泊セット', items: ['充電器', '傘'] } });
    expect(p).not.toHaveProperty('trip');
    expect(decodePayload(encodePayload(p))).toEqual(p);
    const old = parsePayload({ v: 1, kind: 'packing', sharedAt: 'x', trip: { name: '京都' }, packing: [{ name: '傘' }] });
    expect(old).toEqual({ v: 1, kind: 'packing', sharedAt: 'x', list: { name: '京都の持ち物', items: ['傘'] } });
  });
});
