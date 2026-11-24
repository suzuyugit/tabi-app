import { toYmd } from './date';
import { msToIso, msToWall, wallToMs } from './timezone';

const pad = (n: number) => String(n).padStart(2, '0');

/** 端末のタイムゾーン付き ISO 文字列。例：2026-11-24T14:05:00+09:00 */
export function toLocalIso(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${toYmd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

// 以下の tz は旅行の現地の時間帯。未設定なら端末の時刻で扱う

export function nowIso(tz?: string): string {
  return tz ? msToIso(Date.now(), tz) : toLocalIso(new Date());
}

/** ISO → <input type="datetime-local"> の値（YYYY-MM-DDTHH:mm） */
export function isoToInput(iso: string, tz?: string): string {
  if (tz) {
    const w = msToWall(Date.parse(iso), tz);
    return `${w.date}T${w.time}`;
  }
  const d = new Date(iso);
  return `${toYmd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> の値 → ISO。空や不正なら undefined */
export function inputToIso(v: string, tz?: string): string | undefined {
  if (!v) return undefined;
  if (tz) {
    const [date, time] = v.split('T');
    if (!date || !time) return undefined;
    const ms = wallToMs(date, time.slice(0, 5), tz);
    return Number.isNaN(ms) ? undefined : msToIso(ms, tz);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : toLocalIso(d);
}

/** ISO → 日付 YYYY-MM-DD */
export function isoDate(iso: string, tz?: string): string {
  return tz ? msToWall(Date.parse(iso), tz).date : toYmd(new Date(iso));
}

/** ISO → HH:mm */
export function isoTime(iso: string, tz?: string): string {
  if (tz) return msToWall(Date.parse(iso), tz).time;
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 'HH:mm' → 0時からの分 */
export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

/** 'HH:mm' に分を足す。0:00〜23:59 からはみ出したら端で止め、clamped = true */
export function addMinutesHm(hm: string, delta: number): { time: string; clamped: boolean } {
  const m = hmToMinutes(hm) + delta;
  const c = Math.min(Math.max(m, 0), 23 * 60 + 59);
  return { time: `${pad(Math.floor(c / 60))}:${pad(c % 60)}`, clamped: c !== m };
}

/** 分 → 「40分」「1時間20分」 */
export function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}分`;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}
