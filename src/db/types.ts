// SPEC.md「データ設計」のとおり。金額はすべて整数（円）、日時は ISO 文字列。

export type Member = { id: string; name: string; isMe: boolean };

export type Trip = {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  budget: number; // 予算（円）。自分の分だけ（0 なら予算なし）
  members: Member[]; // 自分＋友人
  cashOnHand?: number; // 出発時の自分の手持ち現金（現地通貨の最小単位）
  currency?: string; // 現地通貨（ISO コード。未設定なら円）
  rate?: number; // 1現地通貨 = rate 円（海外のときだけ）
  timeZone?: string; // 現地の時間帯（IANA 名。例：Pacific/Honolulu）。未設定なら日本時間
  createdAt: string;
};

/** 予定の種類 */
export type ItemKind = 'move' | 'food' | 'sightseeing' | 'stay' | 'shopping' | 'other';

/** 移動の手段 */
export type Transport = 'plane' | 'shinkansen' | 'train' | 'bus' | 'taxi' | 'car' | 'walk' | 'ship' | 'other';

export type ItineraryItem = {
  id: string;
  tripId: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm（移動なら出発時刻）
  timeIn?: 'local' | 'japan'; // time が現地時間か日本時間か（時差のある旅行だけ。未設定なら現地）
  title: string;
  kind: ItemKind;
  places: string[]; // 場所（複数可）
  // 移動のときだけ使う
  transport?: Transport;
  from?: string; // 出発地
  to?: string; // 到着地
  arrivalTime?: string; // HH:mm
  arrivalDate?: string; // 到着日（YYYY-MM-DD）。未設定なら date と同じ日
  arrivalIn?: 'local' | 'japan'; // arrivalTime が現地時間か日本時間か
  // 宿泊のときだけ使う（チェックインは date と time）
  checkOutDate?: string; // チェックアウトの日（YYYY-MM-DD）。泊数 = checkOutDate − date
  checkOutTime?: string; // HH:mm（現地時間）
  memo?: string;
  estimatedCost?: number; // estimatedCurrency の最小単位
  estimatedCurrency?: string; // 予想費用の通貨（現地通貨か円）。未設定なら旅行の現地通貨
  reservationNo?: string;
  checkInTime?: string; // HH:mm
  url?: string;
  order: number;
};

export type PaymentMethod = 'cash' | 'card' | 'paypay' | 'other';

export type Expense = {
  id: string;
  tripId: string;
  amount: number; // currency の最小単位（円なら円、ドルならセント）
  currency?: string; // 支払った通貨。未設定なら円
  categoryId: string;
  paymentMethod: PaymentMethod;
  memo?: string;
  datetime: string;
  itemId?: string;
  paidBy: string; // memberId
  splitAmong: string[]; // memberId[]
  splitMode: 'equal' | 'custom';
  customShares?: Record<string, number>; // currency の最小単位
};

export type PackingItem = { id: string; tripId: string; name: string; checked: boolean; order: number };

export type Category = { id: string; name: string; icon: string; usageCount: number };

export type Settlement = { tripId: string; from: string; to: string; amount: number; done: boolean };
