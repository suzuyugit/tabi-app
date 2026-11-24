// 通貨まわり。金額はすべて「その通貨の最小単位の整数」で持つ（円なら円、ドルならセント）。
import type { Trip } from '../db/types';

export type CurrencyInfo = { code: string; name: string; symbol: string; decimals: number };

export const JPY = 'JPY';

/** 選べる通貨（よく行く国から順に） */
export const CURRENCIES: CurrencyInfo[] = [
  { code: 'JPY', name: '日本円', symbol: '¥', decimals: 0 },
  { code: 'KRW', name: '韓国ウォン', symbol: '₩', decimals: 0 },
  { code: 'TWD', name: '台湾ドル', symbol: 'NT$', decimals: 0 },
  { code: 'USD', name: '米ドル', symbol: '$', decimals: 2 },
  { code: 'EUR', name: 'ユーロ', symbol: '€', decimals: 2 },
  { code: 'THB', name: 'タイバーツ', symbol: '฿', decimals: 2 },
  { code: 'CNY', name: '中国人民元', symbol: '元', decimals: 2 },
  { code: 'HKD', name: '香港ドル', symbol: 'HK$', decimals: 2 },
  { code: 'SGD', name: 'シンガポールドル', symbol: 'S$', decimals: 2 },
  { code: 'VND', name: 'ベトナムドン', symbol: '₫', decimals: 0 },
  { code: 'PHP', name: 'フィリピンペソ', symbol: '₱', decimals: 2 },
  { code: 'IDR', name: 'インドネシアルピア', symbol: 'Rp', decimals: 0 },
  { code: 'MYR', name: 'マレーシアリンギット', symbol: 'RM', decimals: 2 },
  { code: 'GBP', name: 'イギリスポンド', symbol: '£', decimals: 2 },
  { code: 'AUD', name: 'オーストラリアドル', symbol: 'A$', decimals: 2 },
  { code: 'NZD', name: 'ニュージーランドドル', symbol: 'NZ$', decimals: 2 },
  { code: 'CAD', name: 'カナダドル', symbol: 'C$', decimals: 2 },
  { code: 'CHF', name: 'スイスフラン', symbol: 'CHF ', decimals: 2 },
];

export function currencyInfo(code: string | undefined): CurrencyInfo {
  return CURRENCIES.find((c) => c.code === (code ?? JPY)) ?? { code: code!, name: code!, symbol: `${code} `, decimals: 2 };
}

/** 旅行の現地通貨（未設定なら円） */
export function tripCurrency(trip: Pick<Trip, 'currency'>): string {
  return trip.currency ?? JPY;
}

export function isForeign(trip: Pick<Trip, 'currency'>): boolean {
  return tripCurrency(trip) !== JPY;
}

/** 最小単位の整数 → 表示。円は「1,200円」、それ以外は「$12.50」（端数がなければ「$12」） */
export function formatMoney(minor: number, code: string | undefined = JPY): string {
  const c = currencyInfo(code);
  if (c.code === JPY) return `${minor.toLocaleString('ja-JP')}円`;
  const unit = 10 ** c.decimals;
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const digits = abs % unit === 0 ? 0 : c.decimals;
  const text = (abs / unit).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${sign}${c.symbol}${text}`;
}

/** 入力欄の文字列 → 最小単位の整数。空なら undefined、不正なら NaN。全角・カンマ可 */
export function parseMoneyInput(s: string, code: string | undefined = JPY): number | undefined {
  const c = currencyInfo(code);
  const t = s
    .replace(/[０-９．]/g, (ch) => (ch === '．' ? '.' : String.fromCharCode(ch.charCodeAt(0) - 0xfee0)))
    .replace(/[,，\s円]/g, '');
  if (t === '') return undefined;
  const re = c.decimals > 0 ? new RegExp(`^\\d+(\\.\\d{0,${c.decimals}})?$`) : /^\d+$/;
  if (!re.test(t)) return NaN;
  const [int, frac = ''] = t.split('.');
  return Number(int) * 10 ** c.decimals + Number(frac.padEnd(c.decimals, '0') || 0);
}

/** 最小単位の整数 → 入力欄の文字列 */
export function toInputValue(minor: number | undefined, code: string | undefined = JPY): string {
  if (minor === undefined) return '';
  const c = currencyInfo(code);
  if (c.decimals === 0) return String(minor);
  const unit = 10 ** c.decimals;
  return minor % unit === 0 ? String(minor / unit) : (minor / unit).toFixed(c.decimals);
}

/**
 * 金額を別の通貨に換算する（最小単位の整数どうし）。
 * 使えるのは「円」と「その旅行の現地通貨」の間だけ。rate は 1現地通貨 = rate 円。
 */
export function convert(minor: number, from: string, to: string, trip: Pick<Trip, 'currency' | 'rate'>): number {
  if (from === to) return minor;
  const local = tripCurrency(trip);
  const rate = trip.rate;
  if (!rate || rate <= 0) return NaN;
  const d = currencyInfo(local).decimals;
  if (from === local && to === JPY) return Math.round((minor / 10 ** d) * rate);
  if (from === JPY && to === local) return Math.round((minor / rate) * 10 ** d);
  return NaN;
}

/** 入力の文字列（例：150.25）→ レート。不正なら NaN、空なら undefined */
export function parseRate(s: string): number | undefined {
  const t = s.replace(/[０-９．]/g, (ch) => (ch === '．' ? '.' : String.fromCharCode(ch.charCodeAt(0) - 0xfee0))).replace(/[,\s]/g, '');
  if (!t) return undefined;
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
  const n = Number(t);
  return n > 0 ? n : NaN;
}
