// 共有リンク（SPEC「共有リンク（サーバーなし）」）
// 共有するデータを JSON → lz-string で圧縮し、URL の # 以降に入れる（# 以降はサーバーに送られない）
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { Category, Expense, ItemKindDef, ItineraryItem, PackingItem, Repayment, Trip } from '../db/types';

export type ShareKind = 'itinerary' | 'settle' | 'packing';

/** 共有に入れる旅行の情報（予算・手持ち現金は入れない） */
export type SharedTrip = Pick<
  Trip,
  'id' | 'name' | 'startDate' | 'endDate' | 'members' | 'currency' | 'rate' | 'timeZone' | 'settleCurrency' | 'settleRound'
>;

export type SharePayload = {
  v: 1;
  kind: ShareKind;
  sharedAt: string;
  trip: SharedTrip;
  items?: Omit<ItineraryItem, 'tripId'>[];
  kinds?: ItemKindDef[];
  expenses?: Omit<Expense, 'tripId'>[];
  categories?: Category[];
  repayments?: Omit<Repayment, 'tripId'>[];
  packing?: { name: string }[]; // 持ち物は名前だけ（チェックの状態は送らない）
};

/** URL がこれより長いときは JSON ファイルで共有する（SPEC：目安 8,000 文字） */
export const MAX_URL_LENGTH = 8000;
export const SHARE_PREFIX = '#share=';

/** 個人の支出（自分が払って自分だけの負担）か */
export function isPersonal(e: Pick<Expense, 'paidBy' | 'splitAmong'>): boolean {
  return e.splitAmong.length === 1 && e.splitAmong[0] === e.paidBy;
}

const strip = <T extends { tripId: string }>({ tripId: _t, ...rest }: T): Omit<T, 'tripId'> => rest;

export function buildPayload(
  kind: ShareKind,
  trip: Trip,
  data: {
    items: ItineraryItem[];
    kinds: ItemKindDef[];
    expenses: Expense[];
    categories: Category[];
    repayments: Repayment[];
    packing?: PackingItem[];
  },
  now = new Date().toISOString(),
): SharePayload {
  const t: SharedTrip = {
    id: trip.id,
    name: trip.name,
    startDate: trip.startDate,
    endDate: trip.endDate,
    members: trip.members,
    currency: trip.currency,
    rate: trip.rate,
    timeZone: trip.timeZone,
    settleCurrency: trip.settleCurrency,
    settleRound: trip.settleRound,
  };
  if (kind === 'itinerary') {
    const used = new Set(data.items.map((i) => i.kind));
    return {
      v: 1,
      kind,
      sharedAt: now,
      trip: t,
      items: data.items.map(strip),
      kinds: data.kinds.filter((k) => used.has(k.id)),
    };
  }
  if (kind === 'packing') {
    return {
      v: 1,
      kind,
      sharedAt: now,
      trip: t,
      packing: [...(data.packing ?? [])].sort((a, b) => a.order - b.order).map((p) => ({ name: p.name })),
    };
  }
  // 割り勘：割り勘した支出だけ（個人の支出は入れない）
  const shared = data.expenses.filter((e) => !isPersonal(e));
  const usedCats = new Set(shared.map((e) => e.categoryId));
  return {
    v: 1,
    kind,
    sharedAt: now,
    trip: t,
    expenses: shared.map(({ itemId: _i, ...e }) => strip(e as Expense)),
    categories: data.categories.filter((c) => usedCats.has(c.id)).map((c) => ({ ...c, usageCount: 0 })),
    repayments: data.repayments.map(strip),
  };
}

export function encodePayload(p: SharePayload): string {
  return compressToEncodedURIComponent(JSON.stringify(p));
}

/** 中身を確かめて取り出す。おかしければ undefined */
export function parsePayload(json: unknown): SharePayload | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const p = json as SharePayload;
  if (p.v !== 1 || !['itinerary', 'settle', 'packing'].includes(p.kind)) return undefined;
  const t = p.trip;
  if (!t || typeof t.id !== 'string' || typeof t.name !== 'string' || !Array.isArray(t.members)) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(t.endDate)) return undefined;
  if (p.items && !Array.isArray(p.items)) return undefined;
  if (p.expenses && !Array.isArray(p.expenses)) return undefined;
  if (p.packing && (!Array.isArray(p.packing) || p.packing.some((x) => typeof x?.name !== 'string'))) return undefined;
  return p;
}

export function decodePayload(encoded: string): SharePayload | undefined {
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    return json ? parsePayload(JSON.parse(json)) : undefined;
  } catch {
    return undefined;
  }
}

export function shareUrl(p: SharePayload, base = `${location.origin}${location.pathname}`): string {
  return `${base}${SHARE_PREFIX}${encodePayload(p)}`;
}
