import { toYmd } from './date';

const pad = (n: number) => String(n).padStart(2, '0');

/** 端末のタイムゾーン付き ISO 文字列。例：2026-11-24T14:05:00+09:00 */
export function toLocalIso(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${toYmd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function nowIso(): string {
  return toLocalIso(new Date());
}

/** ISO → <input type="datetime-local"> の値（YYYY-MM-DDTHH:mm） */
export function isoToInput(iso: string): string {
  const d = new Date(iso);
  return `${toYmd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> の値 → ISO。空や不正なら undefined */
export function inputToIso(v: string): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : toLocalIso(d);
}

/** ISO → 端末時刻での日付 YYYY-MM-DD */
export function isoDate(iso: string): string {
  return toYmd(new Date(iso));
}

/** ISO → 端末時刻での HH:mm */
export function isoTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 'HH:mm' → 0時からの分 */
export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}
