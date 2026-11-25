// 「その日どこにいるか」（例：11/25 東京、11/26 札幌）を旅程から決める
import type { ItineraryItem, Trip } from '../db/types';
import { addDays, byOrder, tripDays } from './itinerary';

type Item = Pick<ItineraryItem, 'kind' | 'date' | 'time' | 'title' | 'places' | 'to' | 'arrivalDate' | 'arrivalTime' | 'checkOutDate' | 'order'>;

/**
 * 日付 → 場所。決め方（上ほど優先）：
 * 1. 自分で決めた場所（trip.dayPlaces）
 * 2. その日の夜に泊まる宿の「場所」（宿の名前は場所にしない）
 * 3. その日に移動で着いた場所（いちばん最後に着いたもの）
 * 4. 前の日の場所を引き継ぐ
 */
export function dayLocations(trip: Pick<Trip, 'startDate' | 'endDate' | 'dayPlaces'>, items: Item[]): Map<string, string> {
  const out = new Map<string, string>();
  let carry: string | undefined;
  for (const d of tripDays(trip)) {
    const day = d.date;
    const manual = trip.dayPlaces?.[day]?.trim();
    const stay = items
      .filter((it) => it.kind === 'stay' && it.places?.[0]?.trim() && it.date <= day && day < (it.checkOutDate ?? addDays(it.date, 1)))
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const arrivals = items
      .filter((it) => it.kind === 'move' && it.to?.trim() && (it.arrivalDate ?? it.date) === day)
      .sort((a, b) => (a.arrivalTime ?? a.time ?? '').localeCompare(b.arrivalTime ?? b.time ?? '') || byOrder(a as ItineraryItem, b as ItineraryItem));
    const arrived = arrivals[arrivals.length - 1]?.to?.trim();
    const loc = manual || stay?.places?.[0]?.trim() || arrived || carry;
    if (loc) out.set(day, loc);
    carry = loc;
  }
  return out;
}

/** 「11/25(水) 札幌」のように、日付の表示に場所を足す */
export function withPlace(label: string, place: string | undefined): string {
  return place ? `${label} ${place}` : label;
}
