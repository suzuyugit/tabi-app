import { db } from './db';
import type { Trip } from './types';
import type { TripPayload } from '../lib/share';
import { newId } from '../lib/id';
import { putPackingNames } from './packingRepo';
import { isPersonal } from '../lib/share';

/**
 * 共有された旅行を取り込む。meId は「あなたは誰？」で選んだメンバー。
 * - 旅行がなければ新しく作る（予算・手持ち現金は空）。あれば旅行の情報を上書き（予算・手持ち現金はそのまま）
 * - 旅程：予定を全部入れ替える。足りない予定の種類を足す
 * - 割り勘：割り勘した支出と渡したお金の記録を入れ替える（自分の個人の支出は残す）
 * - 旅程と一緒に割り勘・持ち物が送られてきたら、それも入れる（持ち物は「ないものだけ追加」）
 */
/** 保存のしかた。name = 保存する名前、asNew = 同じ旅行があっても上書きせず別の旅行として保存 */
export type SaveOptions = { name?: string; asNew?: boolean };

/**
 * 別の旅行として保存するときは、旅行・予定・支出・渡したお金の ID を付け直す
 * （同じ ID のまま入れると、元の旅行のデータを上書きしてしまうため）
 */
export function asNewTrip(p: TripPayload): TripPayload {
  const itemIds = new Map((p.items ?? []).map((it) => [it.id, newId()]));
  return {
    ...p,
    trip: { ...p.trip, id: newId() },
    items: p.items?.map((it) => ({ ...it, id: itemIds.get(it.id)! })),
    expenses: p.expenses?.map((e) => ({ ...e, id: newId(), itemId: e.itemId ? itemIds.get(e.itemId) : undefined })),
    repayments: p.repayments?.map((r) => ({ ...r, id: newId() })),
  };
}

function applyOptions(p: TripPayload, o: SaveOptions = {}): TripPayload {
  const q = o.asNew ? asNewTrip(p) : p;
  const name = o.name?.trim();
  return name ? { ...q, trip: { ...q.trip, name } } : q;
}

export async function importShared(src: TripPayload, meId: string, opts?: SaveOptions): Promise<string> {
  const p = applyOptions(src, opts);
  const tripId = p.trip.id;
  const withSettle = p.kind === 'settle' || !!p.with?.includes('settle');
  await db.transaction('rw', [db.trips, db.itineraryItems, db.itemKinds, db.expenses, db.categories, db.repayments, db.packingItems], async () => {
    const current = await db.trips.get(tripId);
    const members = p.trip.members.map((m) => ({ ...m, isMe: m.id === meId }));
    const trip: Trip = current ? ({ ...current, ...p.trip, members, id: tripId } as Trip) : newTripFrom(p, meId);
    await db.trips.put(trip);

    if (p.kind === 'itinerary') {
      await db.itineraryItems.where('tripId').equals(tripId).delete();
      await db.itineraryItems.bulkPut((p.items ?? []).map((it) => ({ ...it, tripId })));
      for (const k of p.kinds ?? []) {
        if (!(await db.itemKinds.get(k.id))) await db.itemKinds.add(k);
      }
    }
    if (withSettle) {
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
  // 一緒に送られた持ち物は、受け取った人の持ち物を消さないよう「ないものだけ追加」
  if (p.with?.includes('packing')) await putPackingNames(tripId, p.packing ?? [], 'merge');
  return tripId;
}

function newTripFrom(p: TripPayload, meId: string): Trip {
  return {
    ...p.trip,
    members: p.trip.members.map((m) => ({ ...m, isMe: m.id === meId })),
    budget: 0,
    createdAt: new Date().toISOString(),
  } as Trip;
}

/**
 * 一緒に行かない人に送られた旅程を保存する（見る用・参考用）。
 * 同じ旅行がなければ「自分」1人の旅行として作り、あれば予定だけ入れ替える（メンバー・予算などはそのまま）
 */
export async function importAsViewer(src: TripPayload, myName: string, opts?: SaveOptions): Promise<string> {
  const p = applyOptions(src, opts);
  const tripId = p.trip.id;
  await db.transaction('rw', [db.trips, db.itineraryItems, db.itemKinds], async () => {
    const current = await db.trips.get(tripId);
    if (current) {
      await db.trips.put({ ...current, name: p.trip.name, startDate: p.trip.startDate, endDate: p.trip.endDate });
    } else {
      await db.trips.put({
        ...p.trip,
        members: [{ id: newId(), name: myName || '自分', isMe: true }],
        budget: 0,
        createdAt: new Date().toISOString(),
      } as Trip);
    }
    await db.itineraryItems.where('tripId').equals(tripId).delete();
    await db.itineraryItems.bulkPut((p.items ?? []).map((it) => ({ ...it, tripId })));
    for (const k of p.kinds ?? []) {
      if (!(await db.itemKinds.get(k.id))) await db.itemKinds.add(k);
    }
  });
  return tripId;
}
