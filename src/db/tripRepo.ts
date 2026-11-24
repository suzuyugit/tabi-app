import { db } from './db';
import type { Expense, Trip } from './types';
import { newId } from '../lib/id';
import type { TripInput } from '../lib/trips';

/** その支出にメンバーが関わっているか（払った・割る・個別負担） */
function involves(e: Expense, memberId: string): boolean {
  return e.paidBy === memberId || e.splitAmong.includes(memberId) || (e.customShares?.[memberId] ?? 0) !== 0;
}

/** 支出に関わっているため削除できないメンバーの ID 一覧 */
export async function membersInUse(tripId: string): Promise<Set<string>> {
  const expenses = await db.expenses.where('tripId').equals(tripId).toArray();
  const used = new Set<string>();
  for (const e of expenses) {
    used.add(e.paidBy);
    e.splitAmong.forEach((id) => used.add(id));
    Object.entries(e.customShares ?? {}).forEach(([id, v]) => v !== 0 && used.add(id));
  }
  // 返したお金の記録に出てくる人も消せない
  for (const r of await db.repayments.where('tripId').equals(tripId).toArray()) {
    used.add(r.from);
    used.add(r.to);
  }
  return used;
}

export async function createTrip(input: TripInput, copyPackingFrom?: string): Promise<string> {
  const id = newId();
  const trip: Trip = { ...input, id, createdAt: new Date().toISOString() };
  await db.transaction('rw', db.trips, db.packingItems, db.packingLists, async () => {
    await db.trips.add(trip);
    if (copyPackingFrom?.startsWith('list:')) {
      // 名前を付けて保存した持ち物リストから
      const list = await db.packingLists.get(copyPackingFrom.slice('list:'.length));
      await db.packingItems.bulkAdd(
        (list?.items ?? []).map((name, i) => ({ id: newId(), tripId: id, name, checked: false, order: i })),
      );
    } else if (copyPackingFrom) {
      const src = await db.packingItems.where('tripId').equals(copyPackingFrom).sortBy('order');
      // チェックは全部外した状態でコピーする
      await db.packingItems.bulkAdd(
        src.map((p, i) => ({ id: newId(), tripId: id, name: p.name, checked: false, order: i })),
      );
    }
  });
  return id;
}

export class MemberInUseError extends Error {
  constructor(public names: string[]) {
    super(`${names.join('、')} は支出や精算に関わっているので削除できません`);
  }
}

export class CurrencyInUseError extends Error {
  constructor(code: string) {
    super(`${code} で記録した支出や精算があるので、現地通貨は変更できません（レートは変更できます）`);
  }
}

export async function updateTrip(id: string, input: TripInput): Promise<void> {
  await db.transaction('rw', db.trips, db.expenses, db.repayments, async () => {
    const current = await db.trips.get(id);
    if (!current) throw new Error('旅行が見つかりません');
    const oldCur = current.currency ?? 'JPY';
    const newCur = input.currency ?? 'JPY';
    if (oldCur !== newCur && oldCur !== 'JPY') {
      // 前の現地通貨で記録した支出は、レートが無くなると円に換算できなくなる
      const used =
        (await db.expenses.where('tripId').equals(id).filter((e) => e.currency === oldCur).count()) +
        (await db.repayments.where('tripId').equals(id).filter((r) => r.currency === oldCur).count());
      if (used > 0) throw new CurrencyInUseError(oldCur);
    }
    const keep = new Set(input.members.map((m) => m.id));
    const removed = current.members.filter((m) => !keep.has(m.id));
    if (removed.length > 0) {
      const expenses = await db.expenses.where('tripId').equals(id).toArray();
      const repayments = await db.repayments.where('tripId').equals(id).toArray();
      const blocked = removed.filter(
        (m) => expenses.some((e) => involves(e, m.id)) || repayments.some((r) => r.from === m.id || r.to === m.id),
      );
      if (blocked.length > 0) throw new MemberInUseError(blocked.map((m) => m.name));
    }
    await db.trips.put({ ...current, ...input, cashOnHand: input.cashOnHand, currency: input.currency, rate: input.rate, timeZone: input.timeZone });
  });
}

/** 旅行と、それにひも付く全データを削除する */
export async function deleteTrip(id: string): Promise<void> {
  await db.transaction('rw', [db.trips, db.itineraryItems, db.expenses, db.packingItems, db.repayments], async () => {
    await Promise.all([
      db.itineraryItems.where('tripId').equals(id).delete(),
      db.expenses.where('tripId').equals(id).delete(),
      db.packingItems.where('tripId').equals(id).delete(),
      db.repayments.where('tripId').equals(id).delete(),
    ]);
    await db.trips.delete(id);
  });
}

/** 前回作った旅行の「自分」の名前（新しい旅行の初期値に使う） */
export async function lastMyName(): Promise<string | undefined> {
  const last = await db.trips.orderBy('startDate').last();
  return last?.members.find((m) => m.isMe)?.name;
}
