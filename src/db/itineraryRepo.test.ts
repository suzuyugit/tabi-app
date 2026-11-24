import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createItem, deleteItem, duplicateItem, reorderItems, updateItem } from './itineraryRepo';

const T = 'trip1';
const titles = async (date: string) =>
  (await db.itineraryItems.where('[tripId+date]').equals([T, date]).sortBy('order')).map((i) => i.title);

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('itineraryRepo', () => {
  it('追加すると時刻順の位置に入る', async () => {
    await createItem(T, { kind: 'other', places: [], date: '2026-12-01', time: '12:00', title: '昼食' });
    await createItem(T, { kind: 'other', places: [], date: '2026-12-01', time: '09:00', title: '清水寺' });
    await createItem(T, { kind: 'other', places: [], date: '2026-12-01', title: 'メモ' });
    await createItem(T, { kind: 'other', places: [], date: '2026-12-01', time: '10:30', title: '八坂' });
    expect(await titles('2026-12-01')).toEqual(['清水寺', '八坂', '昼食', 'メモ']);
  });

  it('並び替えは保たれ、時刻を変えたときだけ置き直す', async () => {
    const a = await createItem(T, { kind: 'other', places: [], date: '2026-12-01', time: '09:00', title: 'A' });
    const b = await createItem(T, { kind: 'other', places: [], date: '2026-12-01', time: '10:00', title: 'B' });
    const c = await createItem(T, { kind: 'other', places: [], date: '2026-12-01', time: '11:00', title: 'C' });
    await reorderItems([c, a, b]);
    // メモだけ変えても位置はそのまま
    await updateItem(a, { kind: 'other', places: [], date: '2026-12-01', time: '09:00', title: 'A', memo: 'x' });
    expect(await titles('2026-12-01')).toEqual(['C', 'A', 'B']);
    // 時刻を変えると時刻に合う位置へ
    await updateItem(c, { kind: 'other', places: [], date: '2026-12-01', time: '09:30', title: 'C' });
    expect(await titles('2026-12-01')).toEqual(['A', 'C', 'B']);
    // 別の日へ移すと元の日は詰める
    await updateItem(b, { kind: 'other', places: [], date: '2026-12-02', time: '10:00', title: 'B' });
    expect(await titles('2026-12-01')).toEqual(['A', 'C']);
    expect(await titles('2026-12-02')).toEqual(['B']);
  });

  it('複数の日へ複製できる', async () => {
    await createItem(T, { kind: 'other', places: [], date: '2026-12-02', time: '08:00', title: '朝食' });
    const id = await createItem(T, { kind: 'other', date: '2026-12-01', time: '07:30', title: '散歩', places: ['鴨川'] });
    await duplicateItem(id, ['2026-12-02', '2026-12-03']);
    expect(await titles('2026-12-02')).toEqual(['散歩', '朝食']);
    expect(await titles('2026-12-03')).toEqual(['散歩']);
    expect(await db.itineraryItems.count()).toBe(4);
  });

  it('削除するとひも付いた支出のひも付けだけ外れる', async () => {
    const id = await createItem(T, { kind: 'other', places: [], date: '2026-12-01', title: '清水寺' });
    await db.expenses.add({
      id: 'e1', tripId: T, amount: 500, categoryId: 'cat-05-sightseeing', paymentMethod: 'cash',
      datetime: '2026-12-01T10:00:00+09:00', itemId: id, paidBy: 'm', splitAmong: ['m'], splitMode: 'equal',
    });
    await deleteItem(id);
    const e = await db.expenses.get('e1');
    expect(e).toBeDefined();
    expect(e!.itemId).toBeUndefined();
  });

  it('時差：日本時間の予定も現地時間に直して並べる', async () => {
    await db.trips.add({ id: T, name: 'ハワイ', startDate: '2026-12-01', endDate: '2026-12-03', budget: 0, members: [], createdAt: '', timeZone: 'Pacific/Honolulu' });
    // 日付は「その時刻の時間帯での日付」。日本 12/1 20:00 = 現地 12/1 01:00
    await createItem(T, { kind: 'other', places: [], date: '2026-12-01', time: '00:30', timeIn: 'local', title: '現地0時半' });
    await createItem(T, { kind: 'other', places: [], date: '2026-12-01', time: '02:00', timeIn: 'local', title: '現地2時' });
    await createItem(T, { kind: 'move', places: [], date: '2026-12-01', time: '20:00', timeIn: 'japan', title: '日本20時発' });
    expect(await titles('2026-12-01')).toEqual(['現地0時半', '日本20時発', '現地2時']);
  });

  it('日をまたぐ移動を複製すると、到着日も同じだけずれる', async () => {
    const id = await createItem(T, {
      kind: 'move', places: [], date: '2026-12-01', time: '22:00', title: '夜行バス', transport: 'bus', arrivalDate: '2026-12-02', arrivalTime: '06:00',
    });
    await duplicateItem(id, ['2026-12-05']);
    const copy = (await db.itineraryItems.where('[tripId+date]').equals([T, '2026-12-05']).toArray())[0];
    expect(copy.arrivalDate).toBe('2026-12-06');
  });

  it('宿泊を複製すると、チェックアウトの日も同じだけずれる', async () => {
    const id = await createItem(T, { kind: 'stay', places: [], date: '2026-12-01', time: '15:00', title: 'ホテル', checkOutDate: '2026-12-03' });
    await duplicateItem(id, ['2026-12-10']);
    const copy = (await db.itineraryItems.where('[tripId+date]').equals([T, '2026-12-10']).toArray())[0];
    expect(copy.checkOutDate).toBe('2026-12-12');
  });
});
