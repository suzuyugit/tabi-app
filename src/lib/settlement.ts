// 割り勘の精算（SPEC.md「割り勘ロジック」）
import type { Expense, Member, Trip } from '../db/types';
import { sharesOf } from './split';
import { convert, JPY } from './currency';

export type Transfer = { from: string; to: string; amount: number };

export type MemberBalance = {
  memberId: string;
  paid: number; // 立て替えた額
  owed: number; // 負担する額
  diff: number; // 差額（プラス = 受け取る、マイナス = 払う）
};

export type SettlementResult = { balances: MemberBalance[]; transfers: Transfer[] };

type SplitExpense = Pick<Expense, 'amount' | 'paidBy' | 'splitAmong' | 'splitMode' | 'customShares'>;

/**
 * 1. 全員の差額を 0 で始める
 * 2. 支出ごとに、払った人に +amount、割る人たちに −負担額
 *    （equal：amount ÷ 人数の切り捨て、端数は払った人がかぶる / custom：customShares のまま）
 */
export function balancesOf(expenses: SplitExpense[], members: Pick<Member, 'id'>[]): MemberBalance[] {
  const map = new Map<string, MemberBalance>(members.map((m) => [m.id, { memberId: m.id, paid: 0, owed: 0, diff: 0 }]));
  const get = (id: string) => {
    let b = map.get(id);
    if (!b) map.set(id, (b = { memberId: id, paid: 0, owed: 0, diff: 0 }));
    return b;
  };
  for (const e of expenses) {
    get(e.paidBy).paid += e.amount;
    for (const [id, share] of Object.entries(sharesOf(e))) {
      // 端数を払った人がかぶる分も「負担する額」に入る（sharesOf の合計は必ず amount）
      get(id).owed += share;
    }
  }
  for (const b of map.values()) b.diff = b.paid - b.owed;
  return [...map.values()];
}

/**
 * 3. 差額がプラスの人（受け取る人）とマイナスの人（払う人）に分け、額の大きい順に並べる
 * 4. 先頭同士で「小さいほうの額」を送金し、両方の差額を減らす。0 になった人は外す
 * 5. どちらかが空になるまでくり返す
 */
export function transfersFrom(balances: Pick<MemberBalance, 'memberId' | 'diff'>[]): Transfer[] {
  const receivers = balances.filter((b) => b.diff > 0).map((b) => ({ id: b.memberId, rest: b.diff }));
  const payers = balances.filter((b) => b.diff < 0).map((b) => ({ id: b.memberId, rest: -b.diff }));
  receivers.sort((a, b) => b.rest - a.rest);
  payers.sort((a, b) => b.rest - a.rest);
  const transfers: Transfer[] = [];
  while (receivers.length > 0 && payers.length > 0) {
    const r = receivers[0];
    const p = payers[0];
    const amount = Math.min(r.rest, p.rest);
    transfers.push({ from: p.id, to: r.id, amount });
    r.rest -= amount;
    p.rest -= amount;
    if (r.rest === 0) receivers.shift();
    if (p.rest === 0) payers.shift();
  }
  return transfers;
}

/** 1つの通貨の支出から精算表を作る（SPEC の calcSettlement） */
export function calcSettlement(expenses: SplitExpense[], members: Pick<Member, 'id'>[]): SettlementResult {
  const balances = balancesOf(expenses, members);
  return { balances, transfers: transfersFrom(balances) };
}

/**
 * 旅行の精算表（円）。円と現地通貨が混ざっていても、通貨ごとにぴったり差額を出してから円に換算する。
 * 換算の端数で合計が 0 からずれたら、いちばん多く受け取る人で調整する。
 */
export function settlementForTrip(
  trip: Pick<Trip, 'members' | 'currency' | 'rate'>,
  expenses: (SplitExpense & Pick<Expense, 'currency'>)[],
): SettlementResult {
  const byCur = new Map<string, typeof expenses>();
  for (const e of expenses) {
    const c = e.currency ?? JPY;
    byCur.set(c, [...(byCur.get(c) ?? []), e]);
  }
  const total = new Map<string, MemberBalance>(trip.members.map((m) => [m.id, { memberId: m.id, paid: 0, owed: 0, diff: 0 }]));
  for (const [cur, list] of byCur) {
    const bs = balancesOf(list, trip.members);
    const yen = bs.map((b) => ({
      id: b.memberId,
      paid: convert(b.paid, cur, JPY, trip),
      owed: convert(b.owed, cur, JPY, trip),
    }));
    // 換算の端数で「立て替え合計 ≠ 負担合計」になったら、いちばん多く負担する人の負担額で合わせる
    const gap = yen.reduce((a, b) => a + b.paid - b.owed, 0);
    if (gap !== 0 && yen.length > 0) {
      const top = yen.reduce((a, b) => (b.owed > a.owed ? b : a));
      top.owed += gap;
    }
    for (const y of yen) {
      const t = total.get(y.id) ?? { memberId: y.id, paid: 0, owed: 0, diff: 0 };
      t.paid += y.paid;
      t.owed += y.owed;
      total.set(y.id, t);
    }
  }
  const balances = [...total.values()].map((b) => ({ ...b, diff: b.paid - b.owed }));
  return { balances, transfers: transfersFrom(balances) };
}
