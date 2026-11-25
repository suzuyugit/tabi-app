// 家計簿アプリに送るデータ（家計簿の仕様メモ「たびメモとの連携」）
// 旅行ごとの自分の負担分を円にして、クリップボード経由で家計簿に渡す。形を変えるときは schema を上げ、家計簿も同時に直す。
import type { Category, Expense, ItemKindDef, ItineraryItem, PaymentMethod, Trip } from '../db/types';
import { JPY } from './currency';
import { isoDate } from './datetime';
import { convertExpense, forecast } from './money';
import { shareOf } from './split';

export const LEDGER_HEADER = 'TABIMEMO-LEDGER';
export const LEDGER_SCHEMA = 1;

export type LedgerTrip = {
  tripId: string;
  name: string;
  startDate: string;
  endDate: string;
  budgetYen?: number; // 予算（決めていなければなし）
  estimateYen: number; // 旅行全体の見積もり（使った額＋これからの予定の予想費用）
  spentYen: number; // もう使った自分の負担分の合計
};

export type LedgerEntry = {
  id: string; // = expenseId
  tripId: string;
  date: string; // 払った日 YYYY-MM-DD（旅行の現地の日付）
  categoryName: string;
  categoryIcon: string;
  myShareYen: number; // 自分の負担分（記録したときのレートで換算）
  paymentMethod: PaymentMethod;
  memo?: string;
};

export type LedgerPayload = {
  schema: typeof LEDGER_SCHEMA;
  exportedAt: string;
  trips: LedgerTrip[];
  entries: LedgerEntry[];
};

export type LedgerSource = {
  trips: Trip[];
  expenses: Expense[];
  items: ItineraryItem[];
  kinds: ItemKindDef[];
  categories: Category[];
};

/** 旅行1つ分の、家計簿に送るデータ */
export function ledgerForTrip(
  trip: Trip,
  expenses: Expense[],
  items: ItineraryItem[],
  kinds: ItemKindDef[],
  categories: Category[],
): { trip: LedgerTrip; entries: LedgerEntry[] } {
  const me = trip.members.find((m) => m.isMe)?.id;
  const catById = new Map(categories.map((c) => [c.id, c]));
  const entries: LedgerEntry[] = [];
  if (me) {
    for (const e of expenses) {
      const yen = convertExpense(shareOf(e, me), e, JPY, trip);
      // 自分の負担がない支出（ほかの人だけで割ったもの）と、レートがなくて換算できないものは入れない
      if (!Number.isFinite(yen) || yen <= 0) continue;
      const cat = catById.get(e.categoryId);
      entries.push({
        id: e.id,
        tripId: trip.id,
        date: isoDate(e.datetime, trip.timeZone),
        categoryName: cat?.name ?? 'その他',
        categoryIcon: cat?.icon ?? '📦',
        myShareYen: yen,
        paymentMethod: e.paymentMethod,
        ...(e.memo ? { memo: e.memo } : {}),
      });
    }
  }
  entries.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1));
  const spentYen = entries.reduce((a, e) => a + e.myShareYen, 0);
  const fc = forecast(trip, expenses, items, JPY, kinds);
  // 予定の予想費用が換算できない（レート未設定）ときは、使った額だけを見積もりにする
  const estimateYen = Number.isFinite(fc.total) ? fc.total : spentYen;
  return {
    trip: {
      tripId: trip.id,
      name: trip.name,
      startDate: trip.startDate,
      endDate: trip.endDate,
      ...(trip.budget > 0 ? { budgetYen: trip.budget } : {}),
      estimateYen,
      spentYen,
    },
    entries,
  };
}

/** 全部の旅行の、家計簿に送るデータ */
export function buildLedger(src: LedgerSource, now = new Date().toISOString()): LedgerPayload {
  const byTrip = <T extends { tripId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.tripId, [...(m.get(r.tripId) ?? []), r]);
    return m;
  };
  const ex = byTrip(src.expenses);
  const it = byTrip(src.items);
  const trips: LedgerTrip[] = [];
  const entries: LedgerEntry[] = [];
  for (const t of [...src.trips].sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0))) {
    const r = ledgerForTrip(t, ex.get(t.id) ?? [], it.get(t.id) ?? [], src.kinds, src.categories);
    trips.push(r.trip);
    entries.push(...r.entries);
  }
  return { schema: LEDGER_SCHEMA, exportedAt: now, trips, entries };
}

/** クリップボードに入れる文字列：1行目が見出し、2行目から JSON */
export function encodeLedger(p: LedgerPayload): string {
  return `${LEDGER_HEADER}\n${JSON.stringify(p)}`;
}

/** 家計簿側で読むときと同じ手順で読む（テスト用・家計簿にも同じものを置く） */
export function decodeLedger(text: string): LedgerPayload | { error: 'not-ledger' | 'unknown-schema' } {
  const t = text.trim();
  if (!t.startsWith(`${LEDGER_HEADER}\n`)) return { error: 'not-ledger' };
  let json: unknown;
  try {
    json = JSON.parse(t.slice(LEDGER_HEADER.length + 1));
  } catch {
    return { error: 'not-ledger' };
  }
  const p = json as Partial<LedgerPayload>;
  if (!p || typeof p !== 'object' || !Array.isArray(p.trips) || !Array.isArray(p.entries)) return { error: 'not-ledger' };
  if (p.schema !== LEDGER_SCHEMA) return { error: 'unknown-schema' };
  return p as LedgerPayload;
}
