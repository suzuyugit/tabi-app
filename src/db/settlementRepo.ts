import { db } from './db';
import type { Transfer } from '../lib/settlement';

/**
 * 精算表の「済み」チェック。金額はその都度計算し直すので、
 * 保存した金額と今の金額が違えば「済みではない」とみなす（支出を変えるとチェックは消える：expenseRepo）
 */
export async function setSettled(tripId: string, t: Transfer, done: boolean): Promise<void> {
  if (done) await db.settlements.put({ tripId, from: t.from, to: t.to, amount: t.amount, done: true });
  else await db.settlements.delete([tripId, t.from, t.to]);
}

export async function settledKeys(tripId: string, transfers: Transfer[]): Promise<Set<string>> {
  const saved = await db.settlements.where('tripId').equals(tripId).toArray();
  const ok = new Set<string>();
  for (const t of transfers) {
    const s = saved.find((x) => x.from === t.from && x.to === t.to);
    if (s?.done && s.amount === t.amount) ok.add(`${t.from}>${t.to}`);
  }
  return ok;
}
