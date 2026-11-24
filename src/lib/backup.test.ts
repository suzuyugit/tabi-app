import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { createTrip } from '../db/tripRepo';
import { createItem } from '../db/itineraryRepo';
import { saveExpense } from '../db/expenseRepo';
import { addPacking, savePackingList } from '../db/packingRepo';
import { addItemKind } from '../db/categoryRepo';
import { addRepayment } from '../db/repaymentRepo';
import { backupSummary, checkBackup, exportBackup, restoreBackup, BACKUP_TABLES } from './backup';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function snapshot() {
  const out: Record<string, unknown[]> = {};
  for (const t of BACKUP_TABLES) out[t] = (await db.table(t).toArray()).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return out;
}

describe('JSON バックアップ', () => {
  it('書き出したデータを読み込むと、元どおりに戻る', async () => {
    const tripId = await createTrip(
      { name: 'ハワイ', startDate: '2026-12-01', endDate: '2026-12-03', budget: 100000, currency: 'USD', rate: 150, timeZone: 'Pacific/Honolulu', cashOnHand: 20000,
        members: [{ id: 'a', name: '鈴木', isMe: true }, { id: 'b', name: '佐藤', isMe: false }] },
    );
    const kind = await addItemKind({ name: '温泉', icon: '♨️', categoryId: 'cat-05-sightseeing' });
    await createItem(tripId, { kind, places: ['ワイキキ'], date: '2026-12-01', time: '10:00', timeIn: 'local', title: 'ビーチ', estimatedCost: 2500 });
    await saveExpense(tripId, {
      amount: 9000, currency: 'USD', categoryId: 'cat-03-food', paymentMethod: 'card', datetime: '2026-12-01T19:00:00-10:00',
      paidBy: 'a', splitAmong: ['a', 'b'], splitMode: 'equal', roundUnit: 100, roundMode: 'up',
    });
    await addRepayment({ tripId, from: 'b', to: 'a', amount: 3000, currency: 'USD', datetime: '2026-12-02T10:00:00-10:00' });
    await addPacking(tripId, 'パスポート');
    await savePackingList('海外セット', ['パスポート', '変換プラグ']);
    const before = await snapshot();

    // JSON にして（ファイルを経由するのと同じ）全部消してから読み込む
    const json = JSON.parse(JSON.stringify(await exportBackup()));
    const c = checkBackup(json);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(backupSummary(c.backup)).toContain('旅行 1件・予定 1件・支出 1件・持ち物 1個・持ち物リスト 1件');
    await db.delete();
    await db.open();
    await createTrip({ name: '消えるはずの旅行', startDate: '2026-01-01', endDate: '2026-01-01', budget: 0, members: [{ id: 'x', name: 'X', isMe: true }] });
    await restoreBackup(c.backup);
    expect(await snapshot()).toEqual(before);
  });

  it('ほかのファイルや新しすぎる版は読み込まない', () => {
    expect(checkBackup({ foo: 1 }).ok).toBe(false);
    expect(checkBackup({ app: 'tabimemo', schema: 999, data: { trips: [], itineraryItems: [], expenses: [] } }).ok).toBe(false);
  });

  it('古い版のバックアップ（場所が1つ・種類なし）も今の形で読み込む', async () => {
    await restoreBackup({
      app: 'tabimemo', schema: 1, exportedAt: '',
      data: { trips: [], itineraryItems: [{ id: 'i', tripId: 't', date: '2026-12-01', title: '清水寺', place: '清水寺 京都', order: 0 }], expenses: [] } as never,
    });
    expect(await db.itineraryItems.get('i')).toMatchObject({ kind: 'other', places: ['清水寺 京都'] });
  });
});
