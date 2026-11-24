import type { Member, Trip } from '../db/types';
import { todayYmd } from './date';

export type TripStatus = 'upcoming' | 'ongoing' | 'past';

export function tripStatus(trip: Pick<Trip, 'startDate' | 'endDate'>, today = todayYmd()): TripStatus {
  if (today < trip.startDate) return 'upcoming';
  if (today > trip.endDate) return 'past';
  return 'ongoing';
}

/**
 * 旅行一覧の並び順：日付が近いものから。
 * 旅行中 → これからの旅行（近い順）→ 終わった旅行（最近終わった順）
 */
export function sortTrips<T extends Pick<Trip, 'startDate' | 'endDate' | 'createdAt'>>(trips: T[], today = todayYmd()): T[] {
  const rank: Record<TripStatus, number> = { ongoing: 0, upcoming: 1, past: 2 };
  return [...trips].sort((a, b) => {
    const ra = rank[tripStatus(a, today)];
    const rb = rank[tripStatus(b, today)];
    if (ra !== rb) return ra - rb;
    if (ra === 2) {
      // 終わった旅行は新しいものが上
      if (a.endDate !== b.endDate) return a.endDate < b.endDate ? 1 : -1;
    } else if (a.startDate !== b.startDate) {
      return a.startDate < b.startDate ? -1 : 1;
    }
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

export type TripInput = {
  name: string;
  startDate: string;
  endDate: string;
  budget: number;
  members: Member[];
  cashOnHand?: number;
  currency?: string;
  rate?: number;
};

/** 入力チェック。問題があればエラーメッセージの配列を返す（空なら OK） */
export function validateTrip(input: TripInput): string[] {
  const errors: string[] = [];
  if (!input.name.trim()) errors.push('旅行の名前を入れてください');
  if (!input.startDate || !input.endDate) errors.push('日程を入れてください');
  else if (input.startDate > input.endDate) errors.push('終了日は開始日以降にしてください');
  if (!Number.isInteger(input.budget) || input.budget < 0) errors.push('予算は0以上の整数（円）にしてください');
  if (input.cashOnHand !== undefined && (!Number.isInteger(input.cashOnHand) || input.cashOnHand < 0)) {
    errors.push('手持ち現金を正しく入れてください');
  }
  if (input.currency && input.currency !== 'JPY' && !(input.rate !== undefined && Number.isFinite(input.rate) && input.rate > 0)) {
    errors.push('為替レート（1現地通貨が何円か）を入れてください');
  }
  if (input.members.length === 0) errors.push('メンバーを1人以上入れてください');
  if (input.members.some((m) => !m.name.trim())) errors.push('メンバーの名前が空です');
  const names = input.members.map((m) => m.name.trim());
  if (new Set(names).size !== names.length) errors.push('同じ名前のメンバーがいます');
  if (input.members.filter((m) => m.isMe).length !== 1) errors.push('「自分」はちょうど1人にしてください');
  return errors;
}

/** 金額入力欄の文字列 → 整数（円）。全角数字・カンマを許す。空なら undefined、不正なら NaN */
export function parseYenInput(s: string): number | undefined {
  const normalized = s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，\s円]/g, '');
  if (normalized === '') return undefined;
  if (!/^\d+$/.test(normalized)) return NaN;
  return Number(normalized);
}
