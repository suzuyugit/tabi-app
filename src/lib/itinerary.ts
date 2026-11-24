import type { ItemKind, ItineraryItem, Transport, Trip } from '../db/types';
import { formatMd, parseYmd, toYmd } from './date';
import { hmToMinutes } from './datetime';

export type TripDay = { date: string; index: number; label: string; sub: string };

/** 旅行の日付の一覧（1日目・2日目…） */
export function tripDays(trip: Pick<Trip, 'startDate' | 'endDate'>): TripDay[] {
  const days: TripDay[] = [];
  const d = parseYmd(trip.startDate);
  const end = parseYmd(trip.endDate);
  // 念のため上限（日付を大きく間違えたときに固まらないように）
  for (let i = 0; d <= end && i < 366; i++) {
    const date = toYmd(d);
    days.push({ date, index: i, label: `${i + 1}日目`, sub: formatMd(date) });
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export function byOrder(a: ItineraryItem, b: ItineraryItem): number {
  return a.order - b.order;
}

/**
 * 同じ日の予定（order 順・自分自身は含まない）のどこに入れるかを返す。
 * - 時刻あり：自分より遅い時刻の最初の予定の前。なければ時刻のある最後の予定のすぐ後
 *   （時刻「未定」の予定より上に入れる）
 * - 時刻なし（未定）：最後
 */
export function insertIndex(dayItems: Pick<ItineraryItem, 'time'>[], time: string | undefined): number {
  if (!time) return dayItems.length;
  const later = dayItems.findIndex((it) => it.time !== undefined && it.time > time);
  if (later !== -1) return later;
  let lastTimed = -1;
  dayItems.forEach((it, i) => {
    if (it.time !== undefined) lastTimed = i;
  });
  return lastTimed + 1;
}

/** 配列の from 番目を to 番目に動かした新しい配列 */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

/** 今の時刻にいちばん近い今日の予定（時刻のある予定だけ）。なければ undefined */
export function nearestItem<T extends Pick<ItineraryItem, 'date' | 'time'>>(items: T[], now: Date): T | undefined {
  const today = toYmd(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let best: T | undefined;
  let bestDiff = Infinity;
  for (const it of items) {
    if (it.date !== today || !it.time) continue;
    const diff = Math.abs(hmToMinutes(it.time) - nowMin);
    if (diff < bestDiff) {
      best = it;
      bestDiff = diff;
    }
  }
  return best;
}

export function mapsUrl(place: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
}

/** URL 欄の入力を整える。http(s) が無ければ https:// を付ける */
export function normalizeUrl(s: string): string | undefined {
  const t = s.trim();
  if (!t) return undefined;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export const ITEM_KINDS: { key: ItemKind; label: string; icon: string }[] = [
  { key: 'move', label: '移動', icon: '🚃' },
  { key: 'food', label: '食事', icon: '🍽️' },
  { key: 'sightseeing', label: '観光', icon: '📸' },
  { key: 'stay', label: '宿泊', icon: '🏨' },
  { key: 'shopping', label: '買い物', icon: '🛍️' },
  { key: 'other', label: 'その他', icon: '📌' },
];

export const TRANSPORTS: { key: Transport; label: string; icon: string }[] = [
  { key: 'plane', label: '飛行機', icon: '✈️' },
  { key: 'shinkansen', label: '新幹線', icon: '🚄' },
  { key: 'train', label: '電車', icon: '🚃' },
  { key: 'bus', label: 'バス', icon: '🚌' },
  { key: 'taxi', label: 'タクシー', icon: '🚕' },
  { key: 'car', label: '車', icon: '🚗' },
  { key: 'walk', label: '徒歩', icon: '🚶' },
  { key: 'ship', label: '船', icon: '⛴️' },
  { key: 'other', label: 'その他', icon: '🧭' },
];

export function kindMeta(kind: ItemKind | undefined) {
  return ITEM_KINDS.find((k) => k.key === kind) ?? ITEM_KINDS[ITEM_KINDS.length - 1];
}

export function transportMeta(t: Transport | undefined) {
  return TRANSPORTS.find((x) => x.key === t) ?? TRANSPORTS[TRANSPORTS.length - 1];
}

/** 予定のアイコン（移動なら手段のアイコン） */
export function itemIcon(item: Pick<ItineraryItem, 'kind' | 'transport'>): string {
  return item.kind === 'move' ? transportMeta(item.transport).icon : kindMeta(item.kind).icon;
}

/** Google マップの経路検索（出発地 → 到着地） */
export function routeUrl(from: string, to: string, transport?: Transport): string {
  const mode =
    transport === 'walk' ? 'walking' : transport === 'taxi' || transport === 'car' ? 'driving' : 'transit';
  const q = new URLSearchParams({ api: '1', origin: from, destination: to, travelmode: mode });
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

/** タイトルが空のときの代わりの名前（移動なら「飛行機」など） */
export function fallbackTitle(item: Pick<ItineraryItem, 'kind' | 'transport' | 'from' | 'to'>): string {
  if (item.kind === 'move') return transportMeta(item.transport).label;
  return kindMeta(item.kind).label;
}
