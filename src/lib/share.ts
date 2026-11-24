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

/** 旅程・割り勘の共有（旅行ごと） */
export type TripPayload = {
  v: 1;
  kind: 'itinerary' | 'settle';
  sharedAt: string;
  /** 'others' = 一緒に行かない人（親・参考にしたい人）に見せる旅程。メンバーは入れない */
  audience?: 'others';
  trip: SharedTrip;
  items?: Omit<ItineraryItem, 'tripId'>[];
  kinds?: ItemKindDef[];
  expenses?: Omit<Expense, 'tripId'>[];
  categories?: Category[];
  repayments?: Omit<Repayment, 'tripId'>[];
};

/** 持ち物リストだけの共有（旅行の情報は入れない。持ち物は名前だけで、チェックの状態は送らない） */
export type ListPayload = {
  v: 1;
  kind: 'packing';
  sharedAt: string;
  list: { name: string; items: string[] };
};

export type SharePayload = TripPayload | ListPayload;

/** URL がこれより長いときは JSON ファイルで共有する（SPEC：目安 8,000 文字） */
export const MAX_URL_LENGTH = 8000;
export const SHARE_PREFIX = '#share=';

/** 個人の支出（自分が払って自分だけの負担）か */
export function isPersonal(e: Pick<Expense, 'paidBy' | 'splitAmong'>): boolean {
  return e.splitAmong.length === 1 && e.splitAmong[0] === e.paidBy;
}

const strip = <T extends { tripId: string }>({ tripId: _t, ...rest }: T): Omit<T, 'tripId'> => rest;

/** ほかの人に見せる旅程で、何を入れるか */
export type OthersOptions = { reservations: boolean; costs: boolean; memos: boolean };

export function buildPayload(
  kind: TripPayload['kind'],
  trip: Trip,
  data: { items: ItineraryItem[]; kinds: ItemKindDef[]; expenses: Expense[]; categories: Category[]; repayments: Repayment[] },
  now = new Date().toISOString(),
  others?: OthersOptions,
): TripPayload {
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
  if (kind === 'itinerary' && others) {
    // 一緒に行かない人に見せる：メンバーの名前は入れず、予約情報・費用・メモは選んだものだけ
    const used = new Set(data.items.map((i) => i.kind));
    return {
      v: 1,
      kind,
      sharedAt: now,
      audience: 'others',
      trip: { id: t.id, name: t.name, startDate: t.startDate, endDate: t.endDate, members: [], currency: t.currency, rate: t.rate, timeZone: t.timeZone },
      items: data.items.map((it) => {
        const {
          tripId: _t,
          reservationNo,
          url,
          checkInTime,
          estimatedCost,
          estimatedCurrency,
          memo,
          pinnedPos: _p,
          ...rest
        } = it;
        return {
          ...rest,
          ...(others.reservations ? { reservationNo, url, checkInTime } : {}),
          ...(others.costs ? { estimatedCost, estimatedCurrency } : {}),
          ...(others.memos ? { memo } : {}),
        };
      }),
      kinds: data.kinds.filter((k) => used.has(k.id)),
    };
  }
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

/** 持ち物リストだけの共有 */
export function buildListPayload(name: string, items: string[], now = new Date().toISOString()): ListPayload {
  return { v: 1, kind: 'packing', sharedAt: now, list: { name, items: [...new Set(items.map((s) => s.trim()).filter(Boolean))] } };
}

/** 旅行の持ち物（並び順）→ 名前の一覧 */
export function packingNames(items: Pick<PackingItem, 'name' | 'order'>[]): string[] {
  return [...items].sort((a, b) => a.order - b.order).map((p) => p.name);
}

export function encodePayload(p: SharePayload): string {
  return compressToEncodedURIComponent(JSON.stringify(p));
}

/** 中身を確かめて取り出す。おかしければ undefined */
export function parsePayload(json: unknown): SharePayload | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const raw = json as Record<string, unknown>;
  if (raw.v !== 1) return undefined;
  if (raw.kind === 'packing') {
    const list = raw.list as ListPayload['list'] | undefined;
    if (list && typeof list.name === 'string' && Array.isArray(list.items) && list.items.every((x) => typeof x === 'string')) {
      return raw as unknown as ListPayload;
    }
    // 前の形（旅行の情報＋packing: [{ name }]）のリンクも読めるようにする
    const old = raw as { trip?: { name?: string }; packing?: { name?: unknown }[]; sharedAt?: string };
    if (Array.isArray(old.packing) && old.packing.every((x) => typeof x?.name === 'string')) {
      return buildListPayload(`${old.trip?.name ?? ''}の持ち物`, old.packing.map((x) => x.name as string), old.sharedAt);
    }
    return undefined;
  }
  if (raw.kind !== 'itinerary' && raw.kind !== 'settle') return undefined;
  const p = raw as unknown as TripPayload;
  const t = p.trip;
  if (!t || typeof t.id !== 'string' || typeof t.name !== 'string' || !Array.isArray(t.members)) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(t.endDate)) return undefined;
  if (p.items && !Array.isArray(p.items)) return undefined;
  if (p.expenses && !Array.isArray(p.expenses)) return undefined;
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
