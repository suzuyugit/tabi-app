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
  settleCurrency?: string; // 精算する通貨（円か現地通貨）。未設定なら円
  settleRound?: number; // ざっくり精算：精算表の額をこの単位（精算する通貨の最小単位）で四捨五入。0 / 未設定ならそのまま
  createdAt: string;
};

/** 予定の種類の ID。最初から入っている move / food / sightseeing / stay / shopping / other と、自分で足した種類 */
export type ItemKind = string;

/** 予定の種類（自分で追加・編集できる） */
export type ItemKindDef = {
  id: string;
  name: string;
  icon: string;
  order: number;
  categoryId: string; // 見積もりをカテゴリ別に分けるときに入れる支出のカテゴリ
};

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
  /** 日をまたぐ移動・連泊の「続きのカード」を長押しで動かしたときの、その日の並びでの位置（日付 → 何番目か） */
  pinnedPos?: Record<string, number>;
  memo?: string;
  estimatedCost?: number; // estimatedCurrency の最小単位
  estimatedCurrency?: string; // 予想費用の通貨（現地通貨か円）。未設定なら旅行の現地通貨
  reservationNo?: string;
  checkInTime?: string; // HH:mm
  url?: string;
  order: number;
};

/** 端数の丸め方 */
export type RoundMode = 'up' | 'nearest' | 'down';

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
  /** 均等に割るとき、払った人以外の負担額をこの単位（currency の最小単位）でそろえる。ずれは払った人が持つ */
  roundUnit?: number;
  roundMode?: RoundMode;
};

export type PackingItem = { id: string; tripId: string; name: string; checked: boolean; order: number };

export type Category = { id: string; name: string; icon: string; usageCount: number };

/** 精算で実際に渡したお金の記録（一部だけ返した分も含む） */
export type Repayment = {
  id: string;
  tripId: string;
  from: string; // 払った（返した）人の memberId
  to: string; // 受け取った人の memberId
  amount: number; // currency の最小単位
  currency?: string; // 渡したお金の通貨。未設定なら円
  datetime: string; // ISO
  memo?: string;
};
