import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import type { Category, Expense, Trip } from '../../db/types';
import { cashRemaining, expenseCurrency, summarize, valueIn, type ViewMode } from '../../lib/money';
import { convert, formatMoney, isForeign, JPY, tripCurrency } from '../../lib/currency';
import { isoDate, isoTime } from '../../lib/datetime';
import { formatMd } from '../../lib/date';
import { tripDays } from '../../lib/itinerary';
import { PAYMENT_LABEL } from '../../lib/split';

const VIEW_KEY = 'tabi.moneyView';
const CUR_KEY = 'tabi.moneyCurrency';

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    // 覚えられなくてもよい
  }
}

type Props = { trip: Trip; onEdit: (e: Expense) => void };

export function MoneyTab({ trip, onEdit }: Props) {
  const [mode, setModeState] = useState<ViewMode>(() => (load(VIEW_KEY) === 'group' ? 'group' : 'me'));
  // 表示する通貨：海外の旅行では「現地通貨」と「円」を切り替えられる（最初は現地通貨）
  const [showYen, setShowYenState] = useState(() => load(CUR_KEY) === 'JPY');
  const [dayFilter, setDayFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const meId = trip.members.find((m) => m.isMe)?.id ?? '';
  const local = tripCurrency(trip);
  const foreign = isForeign(trip);
  const display = foreign && !showYen ? local : JPY;
  const fmt = (minor: number) => formatMoney(minor, display);

  const setMode = (m: ViewMode) => {
    setModeState(m);
    save(VIEW_KEY, m);
  };
  const setShowYen = (v: boolean) => {
    setShowYenState(v);
    save(CUR_KEY, v ? JPY : 'local');
  };

  const data = useLiveQuery(async () => {
    const [expenses, categories, items] = await Promise.all([
      db.expenses.where('tripId').equals(trip.id).toArray(),
      db.categories.toArray(),
      db.itineraryItems.where('tripId').equals(trip.id).toArray(),
    ]);
    expenses.sort((a, b) => (a.datetime < b.datetime ? 1 : -1)); // 新しい順
    return { expenses, categories: new Map(categories.map((c) => [c.id, c])), items: new Map(items.map((i) => [i.id, i])) };
  }, [trip.id]);

  const summary = useMemo(
    () => (data ? summarize(data.expenses, mode, meId, display, trip) : undefined),
    [data, mode, meId, display, trip],
  );
  if (!data || !summary) return null;

  // 予算は自分の分（円で持っている）。グループ全体の表示では予算と比べない
  const budget = mode === 'me' && trip.budget > 0 ? convert(trip.budget, JPY, display, trip) : 0;
  const over = budget > 0 && summary.total > budget;
  const cash = cashRemaining(trip, data.expenses);

  // カテゴリ別（多い順）
  const catRows = [...summary.byCategory.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, v]) => ({ cat: data.categories.get(id), id, value: v }));
  const catMax = Math.max(1, ...catRows.map((r) => r.value));

  // 1日ごと（旅行の日程＋日程外で支出がある日）
  const days = tripDays(trip);
  const dayKeys = new Set(days.map((d) => d.date));
  const extraDays = [...summary.byDay.keys()].filter((d) => !dayKeys.has(d)).sort();
  const dayRows = [
    ...days.map((d) => ({ date: d.date, label: d.label, sub: d.sub })),
    ...extraDays.map((d) => ({ date: d, label: '日程外', sub: formatMd(d) })),
  ].map((d) => ({ ...d, value: summary.byDay.get(d.date) ?? 0 }));
  const dayMax = Math.max(1, ...dayRows.map((r) => r.value));

  const filtered = data.expenses.filter(
    (e) => (!dayFilter || isoDate(e.datetime) === dayFilter) && (!catFilter || e.categoryId === catFilter),
  );
  const filteredTotal = filtered.reduce((a, e) => a + valueIn(e, mode, meId, display, trip), 0);
  const nameOf = (id: string) => trip.members.find((m) => m.id === id)?.name ?? '?';
  const usedCats = [...new Set(data.expenses.map((e) => e.categoryId))]
    .map((id) => data.categories.get(id))
    .filter((c): c is Category => Boolean(c));

  return (
    <div className="money">
      <div className="money-toolbar">
        <div className="seg" role="tablist" aria-label="表示">
          <button role="tab" aria-selected={mode === 'me'} className={mode === 'me' ? 'active' : ''} onClick={() => setMode('me')}>
            自分の負担分
          </button>
          <button role="tab" aria-selected={mode === 'group'} className={mode === 'group' ? 'active' : ''} onClick={() => setMode('group')}>
            グループ全体
          </button>
        </div>
        {foreign && (
          <div className="seg seg-small" role="tablist" aria-label="表示する通貨">
            <button role="tab" aria-selected={!showYen} className={!showYen ? 'active' : ''} onClick={() => setShowYen(false)}>
              {local}で見る
            </button>
            <button role="tab" aria-selected={showYen} className={showYen ? 'active' : ''} onClick={() => setShowYen(true)}>
              円で見る
            </button>
          </div>
        )}
      </div>

      <section className="card">
        <div className="card-label">{mode === 'group' ? '使った額（グループ全体）' : '自分の負担分'}</div>
        <div className="hero">
          <span className={`hero-num ${over ? 'over' : ''}`}>{fmt(summary.total)}</span>
          {budget > 0 && <span className="muted"> / {fmt(budget)}</span>}
        </div>
        {foreign && (
          <div className="muted small">
            ≈ {formatMoney(convert(summary.total, display, display === JPY ? local : JPY, trip), display === JPY ? local : JPY)}
            （1 {local} = {trip.rate}円）
          </div>
        )}
        {budget > 0 ? (
          <>
            <div className="bar bar-lg" role="img" aria-label={`予算の${Math.round((summary.total / budget) * 100)}%`}>
              <div className={`bar-fill ${over ? 'over' : ''}`} style={{ width: `${Math.min(summary.total / budget, 1) * 100}%` }} />
            </div>
            <div className={`budget-rest ${over ? 'over' : ''}`}>
              {over ? `⚠ ${fmt(summary.total - budget)} オーバー` : `残り ${fmt(budget - summary.total)}`}
              {display !== JPY && <span className="muted small">（予算 {formatMoney(trip.budget)}）</span>}
            </div>
          </>
        ) : mode === 'me' ? (
          <div className="muted small">予算は旅行の編集画面で設定できます</div>
        ) : (
          trip.budget > 0 && <div className="muted small">予算（自分の分）は「自分の負担分」で見られます</div>
        )}
      </section>

      {cash && (
        <section className="card cash-card">
          <div>
            <div className="card-label">現金の残り{foreign ? `（${cash.currency}）` : ''}</div>
            <div className={`cash-num ${cash.rest < 0 ? 'over' : ''}`}>{formatMoney(cash.rest, cash.currency)}</div>
            {foreign && <div className="muted small">≈ {formatMoney(convert(cash.rest, cash.currency, JPY, trip))}</div>}
          </div>
          <div className="muted small right">
            手持ち {formatMoney(cash.start, cash.currency)}
            <br />− 現金払い {formatMoney(cash.paid, cash.currency)}
          </div>
        </section>
      )}

      <section className="card">
        <h3 className="card-title">カテゴリ別</h3>
        {catRows.length === 0 ? (
          <p className="muted small">まだ支出がありません。右下の＋から記録できます。</p>
        ) : (
          <ul className="hbars">
            {catRows.map((r) => (
              <li key={r.id} className="hbar-row" title={`${r.cat?.name ?? '?'} ${fmt(r.value)}`}>
                <span className="hbar-label">
                  {r.cat?.icon} {r.cat?.name ?? '(削除されたカテゴリ)'}
                </span>
                <span className="hbar-track">
                  <span className="hbar-fill" style={{ width: `${(r.value / catMax) * 100}%` }} />
                </span>
                <span className="hbar-value">
                  {fmt(r.value)}
                  <span className="muted pct">{summary.total > 0 ? `${Math.round((r.value / summary.total) * 100)}%` : ''}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h3 className="card-title">1日ごとの合計</h3>
        <ul className="hbars">
          {dayRows.map((r) => (
            <li key={r.date} className="hbar-row">
              <span className="hbar-label">
                {r.label} <span className="muted small">{r.sub}</span>
              </span>
              <span className="hbar-track">
                {r.value > 0 && <span className="hbar-fill" style={{ width: `${(r.value / dayMax) * 100}%` }} />}
              </span>
              <span className="hbar-value">{fmt(r.value)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="section-title">支出の一覧</h3>
        <div className="filters">
          <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} aria-label="日付で絞り込み">
            <option value="">すべての日</option>
            {dayRows.map((d) => (
              <option key={d.date} value={d.date}>
                {d.label} {d.sub}
              </option>
            ))}
          </select>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} aria-label="カテゴリで絞り込み">
            <option value="">すべてのカテゴリ</option>
            {usedCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </div>
        {(dayFilter || catFilter) && (
          <p className="muted small">
            {filtered.length}件・{fmt(filteredTotal)}
          </p>
        )}
        {filtered.length === 0 ? (
          <p className="empty">支出はありません。</p>
        ) : (
          <ul className="expense-list">
            {filtered.map((e) => {
              const cat = data.categories.get(e.categoryId);
              const item = e.itemId ? data.items.get(e.itemId) : undefined;
              const cur = expenseCurrency(e);
              return (
                <li key={e.id}>
                  <button className="expense-row" onClick={() => onEdit(e)}>
                    <span className="expense-icon">{cat?.icon ?? '❔'}</span>
                    <span className="expense-main">
                      <span className="expense-title">{e.memo || cat?.name || '支出'}</span>
                      <span className="expense-sub">
                        {formatMd(isoDate(e.datetime))} {isoTime(e.datetime)}・{nameOf(e.paidBy)}が{PAYMENT_LABEL[e.paymentMethod]}
                        {e.splitAmong.length < trip.members.length && `・${e.splitAmong.length}人で割り勘`}
                        {item && `・📍${item.title}`}
                      </span>
                    </span>
                    <span className="expense-amount">
                      {formatMoney(e.amount, cur)}
                      {cur !== display && <span className="expense-conv">≈ {fmt(convert(e.amount, cur, display, trip))}</span>}
                      {mode === 'me' && <span className="expense-mine">自分 {fmt(valueIn(e, 'me', meId, display, trip))}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
