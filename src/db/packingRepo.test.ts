import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { addListItem, addPacking, namesFromText, putPackingNames, removeListItem, savePackingList, toggleListItem, togglePacking, tripPackingNames, uncheckAll, uncheckList } from './packingRepo';
import { createTrip } from './tripRepo';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('持ち物', () => {
  it('追加・チェック・全部外す', async () => {
    await addPacking('t', '充電器');
    await addPacking('t', '傘');
    const items = await db.packingItems.where('tripId').equals('t').sortBy('order');
    expect(items.map((p) => [p.name, p.order])).toEqual([
      ['充電器', 0],
      ['傘', 1],
    ]);
    await togglePacking(items[0].id);
    expect((await db.packingItems.get(items[0].id))!.checked).toBe(true);
    await uncheckAll('t');
    expect((await db.packingItems.toArray()).every((p) => !p.checked)).toBe(true);
  });
});


describe('持ち物リスト', () => {
  it('旅行に入れる：ないものだけ追加／入れ替え', async () => {
    await addPacking('t', '傘');
    await togglePacking((await db.packingItems.toArray())[0].id);
    expect(await putPackingNames('t', ['充電器', '傘', ' ', '充電器'], 'merge')).toBe(1);
    expect(await tripPackingNames('t')).toEqual(['傘', '充電器']);
    expect((await db.packingItems.toArray()).find((p) => p.name === '傘')!.checked).toBe(true); // 今ある分はそのまま
    await putPackingNames('t', ['パスポート'], 'replace');
    expect(await tripPackingNames('t')).toEqual(['パスポート']);
  });

  it('名前を付けて保存し、新しい旅行にコピーできる', async () => {
    expect(namesFromText('充電器\n\n 傘\n充電器')).toEqual(['充電器', '傘']);
    const id = await savePackingList('国内1泊セット', ['充電器', '傘']);
    expect((await db.packingLists.get(id))!.items).toEqual(['充電器', '傘']);
    const trip = await createTrip(
      { name: '大阪', startDate: '2026-12-01', endDate: '2026-12-02', budget: 0, members: [{ id: 'a', name: 'A', isMe: true }] },
      `list:${id}`,
    );
    expect(await tripPackingNames(trip)).toEqual(['充電器', '傘']);
  });

  it('リスト単体でチェックリストとして使える', async () => {
    const id = await savePackingList('セット', ['充電器', '傘']);
    await toggleListItem(id, '傘');
    expect((await db.packingLists.get(id))!.checked).toEqual(['傘']);
    expect(await addListItem(id, 'カメラ')).toBe(true);
    expect(await addListItem(id, '傘')).toBe(false);
    // 編集で傘を残すとチェックも残る。消した持ち物のチェックは消える
    await savePackingList('セット', ['傘', 'カメラ'], id);
    expect((await db.packingLists.get(id))!.checked).toEqual(['傘']);
    await removeListItem(id, '傘');
    expect((await db.packingLists.get(id))!).toMatchObject({ items: ['カメラ'], checked: [] });
    await toggleListItem(id, 'カメラ');
    await uncheckList(id);
    expect((await db.packingLists.get(id))!.checked).toEqual([]);
  });
});
