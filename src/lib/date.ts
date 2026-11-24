/** 端末のローカル時刻で YYYY-MM-DD を返す（toISOString は UTC になるので使わない） */
export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayYmd(): string {
  return toYmd(new Date());
}

/** 'YYYY-MM-DD' をローカル時刻の Date にする */
export function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** start〜end の日数（両端を含む）。start > end なら 0 */
export function dayCount(start: string, end: string): number {
  const diff = Math.round((parseYmd(end).getTime() - parseYmd(start).getTime()) / 86_400_000);
  return diff < 0 ? 0 : diff + 1;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 例：11/24(火) */
export function formatMd(ymd: string): string {
  const d = parseYmd(ymd);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

/** 例：2026/11/24(火)〜11/26(木)・2泊3日 */
export function formatRange(start: string, end: string): string {
  const s = parseYmd(start);
  const days = dayCount(start, end);
  const nights = days - 1;
  const stay = days <= 1 ? '日帰り' : `${nights}泊${days}日`;
  const head = `${s.getFullYear()}/${formatMd(start)}`;
  return start === end ? `${head}・${stay}` : `${head}〜${formatMd(end)}・${stay}`;
}

export function formatYen(n: number): string {
  return `${n.toLocaleString('ja-JP')}円`;
}
