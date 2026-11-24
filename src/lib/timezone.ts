// 時差まわり。予定の時刻は「その時刻がどこの時間か（現地 or 日本）」を持ち、
// 旅行に設定した現地の時間帯（IANA 名）を使って換算する。
import type { Trip } from '../db/types';

export const JST = 'Asia/Tokyo';

export type ZoneSide = 'local' | 'japan';

/** 選べる現地の時間帯 */
export const TIME_ZONES: { id: string; label: string }[] = [
  { id: 'Asia/Seoul', label: 'ソウル（韓国）' },
  { id: 'Asia/Taipei', label: '台北（台湾）' },
  { id: 'Asia/Shanghai', label: '上海・北京（中国）' },
  { id: 'Asia/Hong_Kong', label: '香港' },
  { id: 'Asia/Bangkok', label: 'バンコク（タイ）' },
  { id: 'Asia/Ho_Chi_Minh', label: 'ホーチミン・ハノイ（ベトナム）' },
  { id: 'Asia/Singapore', label: 'シンガポール' },
  { id: 'Asia/Manila', label: 'マニラ（フィリピン）' },
  { id: 'Asia/Kuala_Lumpur', label: 'クアラルンプール（マレーシア）' },
  { id: 'Asia/Jakarta', label: 'ジャカルタ（インドネシア西部）' },
  { id: 'Asia/Makassar', label: 'バリ（インドネシア中部）' },
  { id: 'Pacific/Guam', label: 'グアム・サイパン' },
  { id: 'Pacific/Honolulu', label: 'ハワイ' },
  { id: 'America/Los_Angeles', label: 'ロサンゼルス・サンフランシスコ・シアトル' },
  { id: 'America/Denver', label: 'デンバー（アメリカ山岳部）' },
  { id: 'America/Chicago', label: 'シカゴ（アメリカ中部）' },
  { id: 'America/New_York', label: 'ニューヨーク・ワシントン' },
  { id: 'America/Vancouver', label: 'バンクーバー（カナダ）' },
  { id: 'America/Toronto', label: 'トロント（カナダ）' },
  { id: 'Europe/London', label: 'ロンドン（イギリス）' },
  { id: 'Europe/Paris', label: 'パリ・ローマ・ベルリン・マドリード' },
  { id: 'Europe/Helsinki', label: 'ヘルシンキ（フィンランド）' },
  { id: 'Europe/Istanbul', label: 'イスタンブール（トルコ）' },
  { id: 'Asia/Dubai', label: 'ドバイ' },
  { id: 'Australia/Sydney', label: 'シドニー・メルボルン' },
  { id: 'Australia/Brisbane', label: 'ブリスベン・ケアンズ' },
  { id: 'Pacific/Auckland', label: 'オークランド（ニュージーランド）' },
];

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** その瞬間の、その時間帯の壁時計（年月日・時分） */
function wallParts(ms: number, tz: string) {
  const p = Object.fromEntries(partsFormatter(tz).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** その瞬間の UTC からのずれ（分）。例：日本は +540 */
export function offsetMinutes(ms: number, tz: string): number {
  const w = wallParts(ms, tz);
  return Math.round((Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000) / 60000);
}

/** 「その時間帯での日付・時刻」→ 瞬間（ミリ秒） */
export function wallToMs(date: string, time: string, tz: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let ms = guess - offsetMinutes(guess, tz) * 60000;
  // 夏時間の切り替わり付近のずれを直す
  ms = guess - offsetMinutes(ms, tz) * 60000;
  return ms;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 瞬間 → その時間帯での日付・時刻 */
export function msToWall(ms: number, tz: string): { date: string; time: string } {
  const w = wallParts(ms, tz);
  return { date: `${w.y}-${pad(w.mo)}-${pad(w.d)}`, time: `${pad(w.h)}:${pad(w.mi)}` };
}

/** 瞬間 → その時間帯の ISO 文字列（例：2026-12-01T10:00:00-10:00） */
export function msToIso(ms: number, tz: string): string {
  const w = wallParts(ms, tz);
  const off = offsetMinutes(ms, tz);
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return `${w.y}-${pad(w.mo)}-${pad(w.d)}T${pad(w.h)}:${pad(w.mi)}:${pad(w.s)}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** 旅行に時差があるか（現地の時間帯が設定されていて、旅行中に日本とずれる） */
export function hasTimeDiff(trip: Pick<Trip, 'timeZone' | 'startDate'>): boolean {
  if (!trip.timeZone || trip.timeZone === JST) return false;
  const ms = wallToMs(trip.startDate, '12:00', JST);
  return offsetMinutes(ms, trip.timeZone) !== offsetMinutes(ms, JST);
}

/** 時差の説明。例：「日本より 19時間遅い」 */
export function diffLabel(tz: string, date: string): string {
  const ms = wallToMs(date, '12:00', JST);
  const diff = offsetMinutes(ms, tz) - offsetMinutes(ms, JST);
  if (diff === 0) return '日本と時差なし';
  const h = Math.abs(diff) / 60;
  const text = Number.isInteger(h) ? `${h}時間` : `${Math.floor(h)}時間${Math.abs(diff) % 60}分`;
  return `日本より${text}${diff < 0 ? '遅い' : '進んでいる'}`;
}

/** 予定の時刻がどこの時間帯か */
export function zoneOf(trip: Pick<Trip, 'timeZone'>, side: ZoneSide | undefined): string {
  return side === 'japan' || !trip.timeZone ? JST : trip.timeZone;
}

/** 日付の差を「翌日」「前日」「2日後」などに */
export function dayShiftLabel(from: string, to: string): string {
  const diff = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
  if (diff === 0) return '';
  if (diff === 1) return '翌日';
  if (diff === -1) return '前日';
  return diff > 0 ? `${diff}日後` : `${-diff}日前`;
}

/**
 * 予定の時刻をもう片方の時間帯で表す。例：現地 10:00 → { label: '日本', time: '05:00', shift: '翌日' }
 */
export function otherZoneTime(
  trip: Pick<Trip, 'timeZone'>,
  date: string,
  time: string,
  side: ZoneSide | undefined,
): { label: string; time: string; shift: string } {
  const from = zoneOf(trip, side);
  const to = side === 'japan' ? trip.timeZone! : JST;
  const w = msToWall(wallToMs(date, time, from), to);
  return { label: side === 'japan' ? '現地' : '日本', time: w.time, shift: dayShiftLabel(date, w.date) };
}

/**
 * 並べ替え用のキー：その日（現地の日付 day）の 0時からの分。時差のある予定は現地時間に直して比べる。
 * 前日になるならマイナス、翌日なら 1440 以上。
 */
export function localMinutes(trip: Pick<Trip, 'timeZone'>, day: string, date: string, time: string, side?: ZoneSide): number {
  const local = trip.timeZone ?? JST;
  const ms = wallToMs(date, time, zoneOf(trip, side));
  const start = wallToMs(day, '00:00', local);
  return Math.round((ms - start) / 60000);
}

/** 今の現地の日付・時刻（時差のない旅行なら端末の時刻） */
export function nowWall(trip: Pick<Trip, 'timeZone'>, now = Date.now()): { date: string; time: string } {
  if (!trip.timeZone) {
    const d = new Date(now);
    return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  }
  return msToWall(now, trip.timeZone);
}
