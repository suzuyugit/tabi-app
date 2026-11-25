import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Category, ItineraryItem, PlanLine, Trip } from '../db/types';
import { convert, formatMoney, JPY, parseMoneyInput, toInputValue, tripCurrency } from '../lib/currency';
import { datesLabel, defaultCount, itemPlanLines, lineAmount, lineIn, PLAN_UNITS, planByCategory, planTotal, unitMeta } from '../lib/plan';
import { byOrder, itemIcon, tripDays } from '../lib/itinerary';
import { withPlace } from '../lib/location';
import { useDayPlaces } from '../hooks/useDayPlaces';
import { newId } from '../lib/id';
import { useCategories, useItemKinds } from '../hooks/useKinds';
import { MoneyField } from './MoneyField';
import { Sheet } from './Sheet';
import { showToast } from './Toast';

type Props = {
  trip: Trip;
  display: string; // 表示する通貨
  spentByCategory: Map<string, number>; // 自分の負担分（表示通貨）
  categories: Map<string, Category>;
};

const savePlan = (trip: Trip, plan: PlanLine[]) => db.trips.update(trip.id, { plan });

/** お金タブの「見積もりプラン」：食費 1日5,000円 × 5日 のような予算の内訳と、使った額との比べ */
export function PlanCard({ trip, display, spentByCategory, categories }: Props) {
  const [editing, setEditing] = useState<{ line?: PlanLine } | null>(null);
  const [pickingItems, setPickingItems] = useState(false);
  const kinds = useItemKinds();
  // 予想金額を入れた旅程の予定（見積もりに入れるかを選べる）
  const costItems =
    useLiveQuery(
      async () =>
        (await db.itineraryItems.where('tripId').equals(trip.id).toArray())
          .filter((it) => (it.estimatedCost ?? 0) > 0)
          .sort((a, b) => a.date.localeCompare(b.date) || byOrder(a, b)),
      [trip.id],
    ) ?? [];
  const own = trip.plan ?? [];
  const fromItems = itemPlanLines(costItems, trip.planItemIds, trip, kinds);
  const lines = [...own, ...fromItems];
  const fmt = (n: number) => formatMoney(n, display);
  const total = planTotal(lines, display, trip);
  const totalYen = planTotal(lines, JPY, trip);
  const byCat = planByCategory(lines, display, trip);

  const toBudget = async () => {
    if (trip.budget > 0 && !confirm(`予算（自分の分）を ${formatMoney(trip.budget)} から ${formatMoney(totalYen)} に変えますか？`)) return;
    await db.trips.update(trip.id, { budget: totalYen });
    showToast(`予算を ${formatMoney(totalYen)} にしました`);
  };

  return (
    <section className="card">
      <div className="settle-head">
        <h3 className="card-title">見積もりプラン（自分の分）</h3>
        <div className="plan-head-actions">
          {costItems.length > 0 && (
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setPickingItems(true)}>
              🗓 旅程から
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditing({})}>
            ＋ 項目
          </button>
        </div>
      </div>
      {lines.length === 0 ? (
        <p className="muted small">
          「食費 1日5,000円 × 5日」のように、何にいくら使うかの見積もりを立てられます。合計はそのまま予算にもできます。
          {costItems.length > 0 && '「🗓 旅程から」で、予定に入れた予想金額も足せます。'}
        </p>
      ) : (
        <>
          <ul className="plan-list">
            {own.map((l) => {
              const cat = categories.get(l.categoryId);
              const u = unitMeta(l.unit);
              const cur = l.currency ?? JPY;
              return (
                <li key={l.id}>
                  <button type="button" className="plan-row" onClick={() => setEditing({ line: l })}>
                    <span className="plan-name">
                      {cat?.icon ?? '📦'} {l.memo || cat?.name || 'その他'}
                    </span>
                    <span className="plan-formula muted small">
                      {l.unit === 'once' ? '一括' : `${u.per} ${formatMoney(l.amount, cur)} × ${l.count}${u.count}`}
                      {l.dates && l.dates.length > 0 && <span className="plan-dates">📅 {datesLabel(l.dates)}</span>}
                    </span>
                    <span className="plan-amount">
                      {fmt(lineIn(l, display, trip))}
                      {cur !== display && <span className="bd-sub">{formatMoney(lineAmount(l), cur)}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
            {fromItems.map((l) => {
              const it = costItems.find((x) => `item:${x.id}` === l.id)!;
              const cur = l.currency ?? JPY;
              return (
                <li key={l.id}>
                  <button type="button" className="plan-row" onClick={() => setPickingItems(true)}>
                    <span className="plan-name">
                      {itemIcon(it, kinds)} {l.memo}
                    </span>
                    <span className="plan-formula muted small">
                      🗓 旅程の予想金額
                      <span className="plan-dates">📅 {datesLabel(l.dates ?? [])}</span>
                    </span>
                    <span className="plan-amount">
                      {fmt(lineIn(l, display, trip))}
                      {cur !== display && <span className="bd-sub">{formatMoney(lineAmount(l), cur)}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="plan-total">
            <span>合計</span>
            <span className="plan-total-num">{fmt(total)}</span>
          </div>
          {trip.budget > 0 && (
            <p className={`small ${totalYen > trip.budget ? 'over' : 'muted'}`}>
              {totalYen === trip.budget
                ? `予算 ${formatMoney(trip.budget)} とぴったり`
                : `予算 ${formatMoney(trip.budget)} に対して ${
                    totalYen > trip.budget ? `${formatMoney(totalYen - trip.budget)} オーバー` : `${formatMoney(trip.budget - totalYen)} 余裕あり`
                  }`}
            </p>
          )}
          {totalYen !== trip.budget && (
            <button type="button" className="btn btn-ghost btn-block" onClick={toBudget}>
              💰 合計（{formatMoney(totalYen)}）を予算にする
            </button>
          )}

          <h4 className="plan-sub">使った額との比べ</h4>
          <ul className="hbars">
            {[...byCat.entries()].map(([id, planned]) => {
              const spent = spentByCategory.get(id) ?? 0;
              const over = spent > planned;
              const cat = categories.get(id);
              return (
                <li key={id} className="hbar-row" title={`${cat?.name ?? 'その他'} 使った ${fmt(spent)} / 見積もり ${fmt(planned)}`}>
                  <span className="hbar-label">
                    {cat?.icon ?? '📦'} {cat?.name ?? 'その他'}
                  </span>
                  <span className="hbar-track plan-track">
                    {spent > 0 && (
                      <span className={`hbar-fill ${over ? 'over-fill' : ''}`} style={{ width: `${Math.min(spent / Math.max(planned, 1), 1) * 100}%` }} />
                    )}
                  </span>
                  <span className={`hbar-value ${over ? 'over' : ''}`}>
                    {fmt(spent)}
                    <span className="hbar-planned">/ {fmt(planned)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {editing && <PlanLineSheet trip={trip} line={editing.line} onClose={() => setEditing(null)} />}
      {pickingItems && <PlanItemsSheet trip={trip} items={costItems} onClose={() => setPickingItems(false)} />}
    </section>
  );
}

function PlanLineSheet({ trip, line, onClose }: { trip: Trip; line?: PlanLine; onClose: () => void }) {
  const categories = useCategories();
  const local = tripCurrency(trip);
  const [categoryId, setCategoryId] = useState(line?.categoryId ?? '');
  const [currency, setCurrency] = useState(line?.currency ?? local);
  const [amount, setAmount] = useState(toInputValue(line?.amount, line?.currency ?? local));
  const [unit, setUnit] = useState<PlanLine['unit']>(line?.unit ?? 'day');
  const [count, setCount] = useState(String(line?.count ?? defaultCount('day', trip)));
  const [memo, setMemo] = useState(line?.memo ?? '');
  const [dates, setDates] = useState<string[]>(line?.dates ?? []);
  const places = useDayPlaces(trip);
  // 1泊あたりは泊まる夜（最終日を除く）、それ以外は旅行の全部の日
  const allDays = tripDays(trip);
  const dayChoices = unit === 'night' && allDays.length > 1 ? allDays.slice(0, -1) : allDays;
  // 同じ場所の日をまとめて選べるように（例：📍札幌 → 札幌にいる日すべて）
  const placeGroups = [...dayChoices.reduce((m, d) => {
    const p = places.get(d.date);
    if (p) m.set(p, [...(m.get(p) ?? []), d.date]);
    return m;
  }, new Map<string, string[]>())];
  const byDates = (unit === 'day' || unit === 'night') && dates.length > 0; // 選んだ日数を回数にする
  const toggleDate = (d: string) => setDates((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d].sort()));
  const [error, setError] = useState('');
  const amountNum = parseMoneyInput(amount, currency);
  const countNum = byDates ? dates.length : Number(count);
  const ok = amountNum !== undefined && !Number.isNaN(amountNum) && amountNum > 0;
  const preview = ok ? lineAmount({ amount: amountNum, unit, count: unit === 'once' ? 1 : countNum || 0 }) : 0;

  const save = async () => {
    if (!categoryId) return setError('カテゴリを選んでください');
    if (!ok) return setError('金額を入れてください');
    if (unit !== 'once' && (!Number.isInteger(countNum) || countNum <= 0)) return setError('回数（日数など）を入れてください');
    const next: PlanLine = {
      id: line?.id ?? newId(),
      categoryId,
      amount: amountNum,
      currency: currency === JPY ? undefined : currency,
      unit,
      count: unit === 'once' ? 1 : countNum,
      dates: dates.length > 0 ? dates : undefined,
      memo: memo.trim() || undefined,
    };
    const lines = trip.plan ?? [];
    await savePlan(trip, line ? lines.map((l) => (l.id === line.id ? next : l)) : [...lines, next]);
    onClose();
  };

  const remove = async () => {
    if (!line || !confirm('この項目を消しますか？')) return;
    await savePlan(
      trip,
      (trip.plan ?? []).filter((l) => l.id !== line.id),
    );
    onClose();
  };

  return (
    <Sheet
      title={line ? '見積もりを編集' : '見積もりを追加'}
      onClose={onClose}
      action={
        <button type="button" className="btn btn-primary btn-small" onClick={save}>
          保存
        </button>
      }
    >
      <div className="form">
        {error && (
          <p className="errors" role="alert">
            {error}
          </p>
        )}
        <div className="field">
          <span className="label">カテゴリ</span>
          <div className="chips" role="radiogroup" aria-label="カテゴリ">
            {categories?.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={c.id === categoryId}
                className={`pick ${c.id === categoryId ? 'active' : ''}`}
                onClick={() => {
                  setCategoryId(c.id);
                  setError('');
                }}
              >
                {c.icon} {c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label">単位</span>
          <div className="seg" role="radiogroup" aria-label="単位">
            {PLAN_UNITS.map((u) => (
              <button
                key={u.key}
                type="button"
                role="radio"
                aria-checked={unit === u.key}
                className={unit === u.key ? 'active' : ''}
                onClick={() => {
                  setUnit(u.key);
                  if (u.key !== 'once') setCount(String(defaultCount(u.key, trip)));
                  // 1泊あたりに最終日の夜はないので外す
                  if (u.key === 'night') setDates((ds) => ds.filter((d) => d !== trip.endDate || trip.startDate === trip.endDate));
                }}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>
        <MoneyField
          trip={trip}
          label={unit === 'once' ? '金額' : `${unitMeta(unit).per}あたりの金額`}
          value={amount}
          currency={currency}
          onChange={(v) => {
            setAmount(v);
            setError('');
          }}
          onCurrencyChange={setCurrency}
          placeholder="例：5000"
        />
        <div className="field">
          <div className="label-row">
            <span className="label">何月何日の費用か（任意・複数選べます）</span>
          </div>
          <div className="date-quick" role="group" aria-label="まとめて選ぶ">
            <button
              type="button"
              className="chip"
              onClick={() => setDates(dates.length === dayChoices.length ? [] : dayChoices.map((d) => d.date))}
            >
              {dates.length === dayChoices.length ? '選択を外す' : 'すべて選ぶ'}
            </button>
            {placeGroups.length > 1 &&
              placeGroups.map(([place, ds]) => {
                const on = ds.every((d) => dates.includes(d));
                return (
                  <button
                    key={place}
                    type="button"
                    aria-pressed={on}
                    className={`chip ${on ? 'active' : ''}`}
                    onClick={() =>
                      setDates((cur) =>
                        on ? cur.filter((d) => !ds.includes(d)) : [...new Set([...cur, ...ds])].sort(),
                      )
                    }
                  >
                    📍{place}
                  </button>
                );
              })}
            {dates.length > 0 && dates.length < dayChoices.length && (
              <button type="button" className="btn-text" onClick={() => setDates([])}>
                選択を外す
              </button>
            )}
          </div>
          <div className="date-chips" role="group" aria-label="日付">
            {dayChoices.map((d) => (
              <button
                key={d.date}
                type="button"
                aria-pressed={dates.includes(d.date)}
                className={`date-chip ${dates.includes(d.date) ? 'active' : ''}`}
                onClick={() => toggleDate(d.date)}
              >
                <span className="date-chip-day">{d.sub}</span>
                {places.get(d.date) && <span className="date-chip-place">{places.get(d.date)}</span>}
              </button>
            ))}
          </div>
          {byDates && (
            <span className="hint">
              選んだ {dates.length}
              {unitMeta(unit).count}分で計算します
            </span>
          )}
        </div>
        {unit !== 'once' && !byDates && (
          <label className="field">
            <span className="label">{unitMeta(unit).count}数</span>
            <div className="count-row">
              <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} aria-label="回数" />
              <span>{unitMeta(unit).count}</span>
            </div>
          </label>
        )}
        <label className="field">
          <span className="label">メモ（任意・名前のかわりに出ます）</span>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="例：レンタカー" />
        </label>
        <p className="plan-preview">
          ＝ {formatMoney(preview, currency)}
          {currency !== JPY && ` ≈ ${formatMoney(convert(preview, currency, JPY, trip))}`}
        </p>
        {line && (
          <button type="button" className="btn btn-danger-outline btn-block" onClick={remove}>
            この項目を消す
          </button>
        )}
      </div>
    </Sheet>
  );
}

/** 旅程に入れた予想金額のうち、どれを見積もりプランに入れるかを選ぶ */
function PlanItemsSheet({ trip, items, onClose }: { trip: Trip; items: ItineraryItem[]; onClose: () => void }) {
  const kinds = useItemKinds();
  const places = useDayPlaces(trip);
  const [picked, setPicked] = useState<string[]>(() => (trip.planItemIds ?? []).filter((id) => items.some((it) => it.id === id)));
  const days = new Map(tripDays(trip).map((d) => [d.date, d]));
  const all = picked.length === items.length;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const sum = items.filter((it) => picked.includes(it.id)).reduce((a, it) => a + convert(it.estimatedCost ?? 0, it.estimatedCurrency ?? tripCurrency(trip), JPY, trip), 0);

  const save = async () => {
    await db.trips.update(trip.id, { planItemIds: picked.length > 0 ? picked : undefined });
    showToast(picked.length > 0 ? `旅程の予定 ${picked.length}件を見積もりに入れました` : '旅程の予定を見積もりから外しました');
    onClose();
  };

  return (
    <Sheet
      title="旅程から入れる"
      onClose={onClose}
      action={
        <button type="button" className="btn btn-primary btn-small" onClick={save}>
          保存
        </button>
      }
    >
      <div className="form">
        <p className="muted small">予定に入れた予想金額を、見積もりプランに足します。入れたいものを選んでください（カテゴリは予定の種類から決まります）。</p>
        <div className="date-quick">
          <button type="button" className="chip" onClick={() => setPicked(all ? [] : items.map((it) => it.id))}>
            {all ? '選択を外す' : 'すべて選ぶ'}
          </button>
        </div>
        <div className="plan-item-list">
          {items.map((it) => {
            const d = days.get(it.date);
            const cur = it.estimatedCurrency ?? tripCurrency(trip);
            return (
              <label key={it.id} className="check-row plan-item-row">
                <input type="checkbox" checked={picked.includes(it.id)} onChange={() => toggle(it.id)} />
                <span className="plan-item-main">
                  <span className="plan-item-title">
                    {itemIcon(it, kinds)} {it.title || '（名前なし）'}
                  </span>
                  <span className="muted small">{d ? withPlace(`${d.label} ${d.sub}`, places.get(it.date)) : it.date}</span>
                </span>
                <span className="plan-item-cost">{formatMoney(it.estimatedCost ?? 0, cur)}</span>
              </label>
            );
          })}
        </div>
        <p className="plan-preview">
          選んだ {picked.length}件 = {formatMoney(sum)}
        </p>
      </div>
    </Sheet>
  );
}
