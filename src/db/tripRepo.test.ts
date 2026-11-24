import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createTrip, deleteTrip, MemberInUseError, updateTrip } from './tripRepo';
import type { TripInput } from '../lib/trips';

const input = (): TripInput => ({
  name: '京都',
  startDate: '2026-12-01',
  endDate: '2026-12-03',
  budget: 90000,
  members: [
    { id: 'suzuki', name: '鈴木', isMe: true },
    { id: 'sato', name: '佐藤', isMe: false },
    { id: 'tanaka', name: '田中', isMe: false },
  ],
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('DB', () => {
  it('初回にカテゴリの初期値が入る', async () => {
    const cats = await db.categories.toArray();
    expect(cats.map((c) => c.name)).toEqual(['交通', '宿', '食事', 'カフェ・おやつ', '観光', 'お土産', 'その他']);
  });

  it('前の旅行の持ち物をチェックを外してコピーする', async () => {
    const src = await createTrip(input());
    await db.packingItems.bulkAdd([
      { id: 'p1', tripId: src, name: '充電器', checked: true, order: 0 },
      { id: 'p2', tripId: src, name: '歯ブラシ', checked: false, order: 1 },
    ]);
    const id = await createTrip({ ...input(), name: '大阪' }, src);
    const copied = await db.packingItems.where('tripId').equals(id).sortBy('order');
    expect(copied.map((p) => [p.name, p.checked])).toEqual([
      ['充電器', false],
      ['歯ブラシ', false],
    ]);
    // コピー元はそのまま
    expect((await db.packingItems.get('p1'))?.checked).toBe(true);
  });

  it('支出に関わるメンバーは削除できない', async () => {
    const id = await createTrip(input());
    await db.expenses.add({
      id: 'e1',
      tripId: id,
      amount: 9000,
      categoryId: 'cat-03-food',
      paymentMethod: 'cash',
      datetime: '2026-12-01T19:00:00+09:00',
      paidBy: 'sato',
      splitAmong: ['suzuki', 'sato'],
      splitMode: 'equal',
    });
    const without = (mid: string) => ({ ...input(), members: input().members.filter((m) => m.id !== mid) });

    await expect(updateTrip(id, without('sato'))).rejects.toBeInstanceOf(MemberInUseError);
    expect((await db.trips.get(id))?.members).toHaveLength(3);

    // 関わっていない田中は削除できる
    await updateTrip(id, without('tanaka'));
    expect((await db.trips.get(id))?.members.map((m) => m.id)).toEqual(['suzuki', 'sato']);
  });

  it('旅行を消すと関連データも消える', async () => {
    const id = await createTrip(input());
    const other = await createTrip({ ...input(), name: '別の旅行' });
    await db.packingItems.add({ id: 'p1', tripId: id, name: '傘', checked: false, order: 0 });
    await db.packingItems.add({ id: 'p2', tripId: other, name: '傘', checked: false, order: 0 });
    await db.itineraryItems.add({ id: 'i1', tripId: id, date: '2026-12-01', title: '清水寺', kind: 'sightseeing', places: [], order: 0 });
    await db.settlements.add({ tripId: id, from: 'sato', to: 'suzuki', amount: 100, done: true });

    await deleteTrip(id);
    expect(await db.trips.get(id)).toBeUndefined();
    expect(await db.packingItems.where('tripId').equals(id).count()).toBe(0);
    expect(await db.itineraryItems.count()).toBe(0);
    expect(await db.settlements.count()).toBe(0);
    expect(await db.packingItems.where('tripId').equals(other).count()).toBe(1);
  });
});
