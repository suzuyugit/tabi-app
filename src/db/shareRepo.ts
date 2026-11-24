import { db } from './db';
import type { Trip } from './types';
import type { SharePayload } from '../lib/share';
import { isPersonal } from '../lib/share';

/**
 * 共有された旅行を取り込む。meId は「あなたは誰？」で選んだメンバー。
 * - 旅行がなければ新しく作る（予算・手持ち現金は空）。あれば旅行の情報を上書き（予算・手持ち現金はそのまま）
 * - 旅程：予定を全部入れ替える。足りない予定の種類を足す
 * - 割り勘：割り勘した支出と渡したお金の記録を入れ替える（自分の個人の支出は残す）
 */
export async function importShared(p: SharePayload, meId: string): Promise<string> {
  const tripId = p.trip.id;
  await db.transaction('rw', [db.trips, db.itineraryItems, db.itemKinds, db.expenses, db.categories, db.repayments], async () => {
    const current = await db.trips.get(tripId);
    const members = p.trip.members.map((m) => ({ ...m, isMe: m.id === meId }));
    const trip: Trip = {
      ...(current ?? { budget: 0, createdAt: new Date().toISOString() }),
      ...p.trip,
      members,
      id: tripId,
    } as Trip;
    await db.trips.put(trip);

    if (p.kind === 'itinerary') {
      await db.itineraryItems.where('tripId').equals(tripId).delete();
      await db.itineraryItems.bulkPut((p.items ?? []).map((it) => ({ ...it, tripId })));
      for (const k of p.kinds ?? []) {
        if (!(await db.itemKinds.get(k.id))) await db.itemKinds.add(k);
      }
    } else {
      const mine = await db.expenses.where('tripId').equals(tripId).toArray();
      await db.expenses.bulkDelete(mine.filter((e) => !isPersonal(e)).map((e) => e.id));
      await db.expenses.bulkPut((p.expenses ?? []).map((e) => ({ ...e, tripId })));
      for (const c of p.categories ?? []) {
        if (!(await db.categories.get(c.id))) await db.categories.add({ ...c, usageCount: 0 });
      }
      await db.repayments.where('tripId').equals(tripId).delete();
      await db.repayments.bulkPut((p.repayments ?? []).map((r) => ({ ...r, tripId })));
    }
  });
  return tripId;
}
