import type { ItineraryItem, Trip } from '../db/types';
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
 * 時刻があれば「自分より遅い時刻の最初の予定」の前、なければ最後。
 */
export function insertIndex(dayItems: Pick<ItineraryItem, 'time'>[], time: string | undefined): number {
  if (!time) return dayItems.length;
  const i = dayItems.findIndex((it) => it.time !== undefined && it.time > time);
  return i === -1 ? dayItems.length : i;
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
