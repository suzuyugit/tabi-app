import { useState } from 'react';
import { db } from '../db/db';
import type { Category, PlanLine, Trip } from '../db/types';
import { convert, formatMoney, JPY, parseMoneyInput, toInputValue, tripCurrency } from '../lib/currency';
import { datesLabel, defaultCount, lineAmount, lineIn, PLAN_UNITS, planByCategory, planTotal, unitMeta } from '../lib/plan';
import { tripDays } from '../lib/itinerary';
import { useDayPlaces } from '../hooks/useDayPlaces';
import { newId } from '../lib/id';
import { useCategories } from '../hooks/useKinds';
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
  const lines = trip.plan ?? [];
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
        <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditing({})}>
          ＋ 項目
        </button>
      </div>
      {lines.length === 0 ? (
        <p className="muted small">「食費 1日5,000円 × 5日」のように、何にいくら使うかの見積もりを立てられます。合計はそのまま予算にもできます。</p>
      ) : (
        <>
          <ul className="plan-list">
            {lines.map((l) => {
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
            {dates.length > 0 && (
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
