import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import type { Category, Expense, Trip } from '../../db/types';
import { cashRemaining, convertExpense, estimateIn, expenseCurrency, forecast, plannedItems, summarize, valueIn } from '../../lib/money';
import { convert, formatMoney, isForeign, JPY, tripCurrency } from '../../lib/currency';
import { isoDate, isoTime } from '../../lib/datetime';
import { formatMd } from '../../lib/date';
import { tripDays } from '../../lib/itinerary';
import { PAYMENT_LABEL } from '../../lib/split';
import { PlanCard } from '../../components/PlanCard';
import { useDayPlaces } from '../../hooks/useDayPlaces';
import { withPlace } from '../../lib/location';
import { deleteExpense } from '../../db/expenseRepo';
import { SwipeToDelete } from '../../components/SwipeToDelete';
import { showToast } from '../../components/Toast';

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
  // 見るのは自分の負担分だけ（グループ全体の額は精算タブで見る）
  const mode = 'me' as const;
  // 表示する通貨：海外の旅行では「現地通貨」と「円」を切り替えられる（最初は現地通貨）
  const [showYen, setShowYenState] = useState(() => load(CUR_KEY) === 'JPY');
  const [dayFilter, setDayFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const dayPlaces = useDayPlaces(trip);
  const meId = trip.members.find((m) => m.isMe)?.id ?? '';
  const local = tripCurrency(trip);
  const foreign = isForeign(trip);
  const display = foreign && !showYen ? local : JPY;
  const fmt = (minor: number) => formatMoney(minor, display);

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
    const kinds = await db.itemKinds.toArray();
    expenses.sort((a, b) => (a.datetime < b.datetime ? 1 : -1)); // 新しい順
    return { expenses, categories: new Map(categories.map((c) => [c.id, c])), items: new Map(items.map((i) => [i.id, i])), itemList: items, kinds };
  }, [trip.id]);

  const summary = useMemo(
    () => (data ? summarize(data.expenses, mode, meId, display, trip) : undefined),
    [data, mode, meId, display, trip],
  );
  if (!data || !summary) return null;

  // 予算は自分の分（円で持っている）。グループ全体の表示では予算と比べない
  const budget = trip.budget > 0 ? convert(trip.budget, JPY, display, trip) : 0;
  const over = budget > 0 && summary.total > budget;
  // 見積もり：使った額＋これからの予定の予想費用
  const fc = forecast(trip, data.expenses, data.itemList, display, data.kinds);
  const planned = plannedItems(data.itemList, data.expenses).sort(
    (a, b) => a.date.localeCompare(b.date) || a.order - b.order, // 旅程と同じ並び
  );
  const fcOver = budget > 0 && fc.total > budget;
  const scale = Math.max(budget, fc.total, 1);
  const cash = cashRemaining(trip, data.expenses);

  // カテゴリ別：使った額＋これからの予定（予定の種類をカテゴリに当てはめる）。見積もりの多い順
  const catIds = new Set([...summary.byCategory.keys(), ...fc.plannedByCategory.keys()]);
  const catRows = [...catIds]
    .map((id) => {
      const value = summary.byCategory.get(id) ?? 0;
      const plannedV = fc.plannedByCategory.get(id) ?? 0;
      return { cat: data.categories.get(id), id, value, planned: plannedV, total: value + plannedV };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
  const catMax = Math.max(1, ...catRows.map((r) => r.total));

  // 1日ごと（旅行の日程＋日程外で支出がある日）
  const days = tripDays(trip);
  const dayKeys = new Set(days.map((d) => d.date));
  const extraDays = [...summary.byDay.keys()].filter((d) => !dayKeys.has(d)).sort();
  const dayRows = [
    ...days.map((d) => ({ date: d.date, label: d.label, sub: d.sub, place: dayPlaces.get(d.date) })),
    ...extraDays.map((d) => ({ date: d, label: '日程外', sub: formatMd(d), place: undefined as string | undefined })),
  ].map((d) => ({ ...d, value: summary.byDay.get(d.date) ?? 0, planned: fc.plannedByDay.get(d.date) ?? 0 }));
  const dayMax = Math.max(1, ...dayRows.map((r) => r.value + r.planned));

  // ○日目までの累計（日付順に足していく）。使った額とこれからの予定を分けて持つ
  let runSpent = 0;
  let runPlanned = 0;
  const cumRows = [...dayRows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => {
      runSpent += r.value;
      runPlanned += r.planned;
      return { ...r, cumSpent: runSpent, cumPlanned: runPlanned, cum: runSpent + runPlanned };
    });
  const cumScale = Math.max(1, budget, ...cumRows.map((r) => r.cum));
  // 予算を初めて超える日
  const firstOver = budget > 0 ? cumRows.find((r) => r.cum > budget) : undefined;

  const filtered = data.expenses.filter(
    (e) => (!dayFilter || isoDate(e.datetime, trip.timeZone) === dayFilter) && (!catFilter || e.categoryId === catFilter),
  );
  const filteredTotal = filtered.reduce((a, e) => a + valueIn(e, mode, meId, display, trip), 0);
  const nameOf = (id: string) => trip.members.find((m) => m.id === id)?.name ?? '?';
  const usedCats = [...new Set(data.expenses.map((e) => e.categoryId))]
    .map((id) => data.categories.get(id))
    .filter((c): c is Category => Boolean(c));

  return (
    <div className="money">
      {foreign && (
        <div className="seg" role="tablist" aria-label="表示する通貨">
          <button role="tab" aria-selected={!showYen} className={!showYen ? 'active' : ''} onClick={() => setShowYen(false)}>
            {local}で見る
          </button>
          <button role="tab" aria-selected={showYen} className={showYen ? 'active' : ''} onClick={() => setShowYen(true)}>
            円で見る
          </button>
        </div>
      )}

      <section className="card">
        <div className="card-label">自分の負担分</div>
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
        <div
          className="bar bar-lg stack"
          role="img"
          aria-label={`使った額 ${fmt(fc.spent)}、これからの予定 ${fmt(fc.planned)}${budget > 0 ? `、予算 ${fmt(budget)}` : ''}`}
        >
          {fc.spent > 0 && <div className={`bar-fill ${over ? 'over' : ''}`} style={{ width: `${(fc.spent / scale) * 100}%` }} />}
          {fc.planned > 0 && <div className={`bar-fill planned ${fcOver ? 'over' : ''}`} style={{ width: `${(fc.planned / scale) * 100}%` }} />}
          {budget > 0 && fc.total > budget && <div className="budget-tick" style={{ left: `${(budget / scale) * 100}%` }} />}
        </div>
        <ul className="legend">
          <li>
            <span className="swatch" />
            使った額 {fmt(fc.spent)}
          </li>
          {fc.planned > 0 && (
            <li>
              <span className="swatch planned" />
              これからの予定 {fmt(fc.planned)}
            </li>
          )}
        </ul>
        {budget > 0 && (
          <div className={`budget-rest ${over ? 'over' : ''}`}>
            {over ? `⚠ 今の時点で ${fmt(summary.total - budget)} オーバー` : `今の残り ${fmt(budget - summary.total)}`}
            {display !== JPY && <span className="muted small">（予算 {formatMoney(trip.budget)}）</span>}
          </div>
        )}
        {budget === 0 && <div className="muted small">予算は旅行の編集画面で設定できます</div>}
      </section>

      <section className="card forecast">
        <div className="card-label">旅行全体の見積もり（自分の分）</div>
        <div className="hero">
          <span className={`hero-num ${fcOver ? 'over' : ''}`}>{fmt(fc.total)}</span>
          {budget > 0 && <span className="muted"> / {fmt(budget)}</span>}
        </div>
        {foreign && (
          <div className="muted small">
            ≈ {formatMoney(convert(fc.total, display, display === JPY ? local : JPY, trip), display === JPY ? local : JPY)}
          </div>
        )}
        <div className="forecast-calc muted small">
          使った額 {fmt(fc.spent)} ＋ これからの予定 {fmt(fc.planned)}
        </div>
        {budget > 0 && (
          <div className={`budget-rest ${fcOver ? 'over' : ''}`}>
            {fcOver ? `⚠ このままだと ${fmt(fc.total - budget)} オーバーの見込み` : `予算内の見込み（あと ${fmt(budget - fc.total)} 使える）`}
          </div>
        )}
        {planned.length > 0 ? (
          <details className="planned-list">
            <summary>見積もりに入っている予定（{planned.length}件）</summary>
            <ul>
              {planned.map((it) => (
                <li key={it.id}>
                  <span className="muted small">
                    {formatMd(it.date)} {it.time ?? ''}
                  </span>
                  <span className="planned-title">{it.title}</span>
                  <span className="planned-amount">{fmt(estimateIn(it, display, trip))}</span>
                </li>
              ))}
            </ul>
            <p className="muted small">支出を予定にひも付けると、予想費用のかわりに実際の額で数えます。</p>
          </details>
        ) : (
          <p className="muted small">旅程の予定に「予想費用（1人あたり）」を入れると、これから使う額も見積もりに入ります。</p>
        )}
      </section>

      <PlanCard trip={trip} display={display} spentByCategory={summary.byCategory} categories={data.categories} />

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
        <h3 className="card-title">カテゴリ別{fc.planned > 0 ? '（見積もり）' : ''}</h3>
        {catRows.length === 0 ? (
          <p className="muted small">まだ支出がありません。右下の＋から記録できます。</p>
        ) : (
          <>
            {fc.planned > 0 && (
              <ul className="legend legend-top">
                <li>
                  <span className="swatch" />
                  使った額
                </li>
                <li>
                  <span className="swatch planned" />
                  これからの予定
                </li>
              </ul>
            )}
            <ul className="hbars">
              {catRows.map((r) => (
                <li
                  key={r.id}
                  className="hbar-row"
                  title={`${r.cat?.name ?? '?'} 使った額 ${fmt(r.value)}${r.planned ? ` ＋ 予定 ${fmt(r.planned)}` : ''}`}
                >
                  <span className="hbar-label">
                    {r.cat?.icon ?? '📦'} {r.cat?.name ?? 'その他'}
                    <span className="muted pct-inline">{fc.total > 0 ? ` ${Math.round((r.total / fc.total) * 100)}%` : ''}</span>
                  </span>
                  <span className="hbar-track">
                    {r.value > 0 && <span className="hbar-fill" style={{ width: `${(r.value / catMax) * 100}%` }} />}
                    {r.planned > 0 && <span className="hbar-fill planned" style={{ width: `${(r.planned / catMax) * 100}%` }} />}
                  </span>
                  <span className="hbar-value">
                    {fmt(r.total)}
                    <PlannedNote value={r.value} planned={r.planned} fmt={fmt} />
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card">
        <h3 className="card-title">1日ごとの合計</h3>
        <ul className="hbars">
          {dayRows.map((r) => (
            <li key={r.date} className="hbar-row">
              <span className="hbar-label">
                {r.label} <span className="muted small">{r.place ?? r.sub}</span>
              </span>
              <span className="hbar-track">
                {r.value > 0 && <span className="hbar-fill" style={{ width: `${(r.value / dayMax) * 100}%` }} />}
                {r.planned > 0 && <span className="hbar-fill planned" style={{ width: `${(r.planned / dayMax) * 100}%` }} />}
              </span>
              <span className="hbar-value">
                {fmt(r.value + r.planned)}
                <PlannedNote value={r.value} planned={r.planned} fmt={fmt} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      {cumRows.length > 1 && (
        <section className="card">
          <h3 className="card-title">その日までの累計{fc.planned > 0 ? '（見積もり）' : ''}</h3>
          {budget > 0 && (
            <p className={`small ${firstOver ? 'over' : 'muted'}`}>
              {firstOver
                ? `⚠ ${firstOver.sub}（${firstOver.label}）に予算 ${fmt(budget)} を超える見込みです`
                : `最終日まで予算 ${fmt(budget)} の中に収まる見込みです`}
            </p>
          )}
          <ul className="hbars cum-bars">
            {cumRows.map((r) => {
              const over = budget > 0 && r.cum > budget;
              return (
                <li key={r.date} className="hbar-row" title={`${r.label}まで ${fmt(r.cum)}`}>
                  <span className="hbar-label">{r.sub}まで</span>
                  <span className="hbar-track cum-track">
                    {r.cumSpent > 0 && (
                      <span className={`hbar-fill ${over ? 'over-fill' : ''}`} style={{ width: `${(r.cumSpent / cumScale) * 100}%` }} />
                    )}
                    {r.cumPlanned > 0 && (
                      <span className="hbar-fill planned" style={{ width: `${(r.cumPlanned / cumScale) * 100}%` }} />
                    )}
                    {budget > 0 && <span className="cum-budget" style={{ left: `${(budget / cumScale) * 100}%` }} />}
                  </span>
                  <span className={`hbar-value ${over ? 'over' : ''}`}>
                    {fmt(r.cum)}
                    <PlannedNote value={r.cumSpent} planned={r.cumPlanned} fmt={fmt} />
                  </span>
                </li>
              );
            })}
          </ul>
          {budget > 0 && (
            <ul className="legend">
              <li>
                <span className="swatch" />
                使った額
              </li>
              {fc.planned > 0 && (
                <li>
                  <span className="swatch planned" />
                  これからの予定
                </li>
              )}
              <li>
                <span className="swatch-line" />
                予算
              </li>
            </ul>
          )}
        </section>
      )}

      <section>
        <div className="settle-head">
          <h3 className="section-title">支出の一覧</h3>
          <span className="muted small">タップで編集・左にスライドで削除</span>
        </div>
        <div className="filters">
          <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} aria-label="日付で絞り込み">
            <option value="">すべての日</option>
            {dayRows.map((d) => (
              <option key={d.date} value={d.date}>
                {withPlace(`${d.label} ${d.sub}`, d.place)}
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
                  <SwipeToDelete
                    onDelete={async () => {
                      const label = `${e.memo || cat?.name || '支出'} ${formatMoney(e.amount, cur)}`;
                      if (!confirm(`「${label}」を本当に削除しますか？`)) return false;
                      await deleteExpense(e.id);
                      showToast('支出を削除しました');
                      return true;
                    }}
                  >
                  <button className="expense-row" onClick={() => onEdit(e)}>
                    <span className="expense-icon">{cat?.icon ?? '❔'}</span>
                    <span className="expense-main">
                      <span className="expense-title">{e.memo || cat?.name || '支出'}</span>
                      <span className="expense-sub">
                        {formatMd(isoDate(e.datetime, trip.timeZone))} {isoTime(e.datetime, trip.timeZone)}・{nameOf(e.paidBy)}が{PAYMENT_LABEL[e.paymentMethod]}
                        {!(e.splitAmong.length === 1 && e.splitAmong[0] === e.paidBy) &&
                          (e.splitAmong.length === trip.members.length ? '・全員で割り勘' : `・${e.splitAmong.length}人で割り勘`)}
                        {item && `・📍${item.title}`}
                      </span>
                    </span>
                    <span className="expense-amount">
                      {formatMoney(e.amount, cur)}
                      {foreign && (
                        // 払った通貨ともう片方の通貨の両方を出す
                        <span className="expense-conv">
                          ≈ {formatMoney(convertExpense(e.amount, e, cur === JPY ? local : JPY, trip), cur === JPY ? local : JPY)}
                        </span>
                      )}
                      <span className="expense-mine">自分 {fmt(valueIn(e, 'me', meId, display, trip))}</span>
                    </span>
                  </button>
                  </SwipeToDelete>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/** 見積もりの内訳の小さな注記：「うち予定 5,000円」「すべて予定」 */
function PlannedNote({ value, planned, fmt }: { value: number; planned: number; fmt: (n: number) => string }) {
  if (planned <= 0) return null;
  return <span className="hbar-planned">{value > 0 ? `うち予定 ${fmt(planned)}` : 'すべて予定'}</span>;
}
