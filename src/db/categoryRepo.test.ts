import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, TabiDB } from './db';
import { addCategory, addItemKind, deleteCategory, deleteItemKind } from './categoryRepo';
import { forecast } from '../lib/money';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('カテゴリ・予定の種類を自分で足す／消す', () => {
  it('最初から予定の種類が入っている', async () => {
    expect((await db.itemKinds.orderBy('order').toArray()).map((k) => k.name)).toEqual(['移動', '食事', '観光', '宿泊', '買い物', 'その他']);
  });

  it('カテゴリを消すと、使っていた支出と種類は「その他」に移る', async () => {
    const id = await addCategory('ガソリン', '⛽');
    const kind = await addItemKind({ name: 'ドライブ', icon: '🚗', categoryId: id });
    await db.expenses.add({
      id: 'e1', tripId: 't', amount: 3000, categoryId: id, paymentMethod: 'card', datetime: '2026-12-01T12:00:00+09:00',
      paidBy: 'a', splitAmong: ['a'], splitMode: 'equal',
    });
    await deleteCategory(id);
    expect((await db.expenses.get('e1'))!.categoryId).toBe('cat-07-other');
    expect((await db.itemKinds.get(kind))!.categoryId).toBe('cat-07-other');
    await expect(deleteCategory('cat-07-other')).rejects.toThrow();
  });

  it('種類を消すと、使っていた予定は「その他」に。移動・宿泊・その他は消せない', async () => {
    const kind = await addItemKind({ name: '温泉', icon: '♨️', categoryId: 'cat-05-sightseeing' });
    expect((await db.itemKinds.get(kind))!.order).toBe(6);
    await db.itineraryItems.add({ id: 'i1', tripId: 't', date: '2026-12-01', title: '道後温泉', kind, places: [], order: 0 });
    await deleteItemKind(kind);
    expect((await db.itineraryItems.get('i1'))!.kind).toBe('other');
    await expect(deleteItemKind('move')).rejects.toThrow();
    await expect(deleteItemKind('stay')).rejects.toThrow();
  });

  it('足した種類のカテゴリで見積もりを分ける', async () => {
    const kind = await addItemKind({ name: '温泉', icon: '♨️', categoryId: 'cat-05-sightseeing' });
    const kinds = await db.itemKinds.toArray();
    const f = forecast({ members: [{ id: 'a', name: 'A', isMe: true }] }, [], [{ id: 'i', date: '2026-12-01', kind, estimatedCost: 1500 }], 'JPY', kinds);
    expect(f.plannedByCategory.get('cat-05-sightseeing')).toBe(1500);
  });
});

describe('v3 → v4 の移行', () => {
  it('前からあるデータに予定の種類を入れる', async () => {
    const name = 'tabi-v3-test';
    const old = new Dexie(name);
    old.version(1).stores({
      trips: 'id, startDate, endDate', itineraryItems: 'id, tripId, [tripId+date]', expenses: 'id, tripId, categoryId, datetime',
      packingItems: 'id, tripId', categories: 'id, usageCount', settlements: '[tripId+from+to], tripId',
    });
    old.version(3).stores({ settlements: null, repayments: 'id, tripId' });
    await old.open();
    old.close();
    const d = new TabiDB(name);
    expect(await d.itemKinds.count()).toBe(6);
    d.close();
  });
});
