import { db } from './db';
import { newId } from '../lib/id';
import type { Trip } from './types';
import type { SharePayload } from '../lib/share';
import { isPersonal } from '../lib/share';

/**
 * 共有された旅行を取り込む。meId は「あなたは誰？」で選んだメンバー。
 * - 旅行がなければ新しく作る（予算・手持ち現金は空）。あれば旅行の情報を上書き（予算・手持ち現金はそのまま）
 * - 旅程：予定を全部入れ替える。足りない予定の種類を足す
 * - 割り勘：割り勘した支出と渡したお金の記録を入れ替える（自分の個人の支出は残す）
 * - 持ち物：このスマホにない名前の持ち物だけ足す（チェックは外した状態）
 */
export async function importShared(p: SharePayload, meId: string): Promise<string> {
  const tripId = p.trip.id;
  await db.transaction('rw', [db.trips, db.itineraryItems, db.itemKinds, db.expenses, db.categories, db.repayments, db.packingItems], async () => {
    const current = await db.trips.get(tripId);
    if (p.kind === 'packing') {
      // 持ち物：旅行がなければ作り、このスマホにない持ち物だけ足す（上書きしない）
      if (!current) await db.trips.put(newTripFrom(p, meId));
      await addMissingPacking(tripId, p.packing ?? []);
      return;
    }
    const members = p.trip.members.map((m) => ({ ...m, isMe: m.id === meId }));
    const trip: Trip = current ? ({ ...current, ...p.trip, members, id: tripId } as Trip) : newTripFrom(p, meId);
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

function newTripFrom(p: SharePayload, meId: string): Trip {
  return {
    ...p.trip,
    members: p.trip.members.map((m) => ({ ...m, isMe: m.id === meId })),
    budget: 0,
    createdAt: new Date().toISOString(),
  } as Trip;
}

/** 同じ名前がないものだけ、最後に足す */
async function addMissingPacking(tripId: string, list: { name: string }[]): Promise<number> {
  const have = await db.packingItems.where('tripId').equals(tripId).toArray();
  const names = new Set(have.map((x) => x.name.trim()));
  let order = have.reduce((m, x) => Math.max(m, x.order), -1);
  const add = list
    .map((x) => x.name.trim())
    .filter((n) => n && !names.has(n) && (names.add(n), true))
    .map((name) => ({ id: newId(), tripId, name, checked: false, order: ++order }));
  await db.packingItems.bulkAdd(add);
  return add.length;
}

/** 取り込むと、いくつ足されるか（このスマホにない持ち物の数） */
export async function countNewPacking(tripId: string, list: { name: string }[]): Promise<number> {
  const have = new Set((await db.packingItems.where('tripId').equals(tripId).toArray()).map((x) => x.name.trim()));
  return new Set(list.map((x) => x.name.trim()).filter((n) => n && !have.has(n))).size;
}
