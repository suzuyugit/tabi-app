import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Expense, PaymentMethod, Trip } from '../db/types';
import { deleteExpense, lastPaymentMethod, saveExpense, type ExpenseInput } from '../db/expenseRepo';
import { inputToIso, isoToInput, nowIso } from '../lib/datetime';
import { byOrder, nearestItem, tripDays } from '../lib/itinerary';
import { formatMd, formatYen } from '../lib/date';
import { parseYenInput } from '../lib/trips';
import { PAYMENT_LABEL, PAYMENT_METHODS, sharesOf, validateExpense } from '../lib/split';
import { Sheet } from './Sheet';
import { showToast } from './Toast';

type Props = { trip: Trip; expense?: Expense; onClose: () => void };

/** 支出のクイック入力（編集にも使う）。最短で「金額 → カテゴリ → 保存」 */
export function ExpenseSheet({ trip, expense, onClose }: Props) {
  const me = trip.members.find((m) => m.isMe) ?? trip.members[0];
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [categoryId, setCategoryId] = useState(expense?.categoryId ?? '');
  const [paidBy, setPaidBy] = useState(expense?.paidBy ?? me.id);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(expense?.paymentMethod ?? lastPaymentMethod());
  const [splitAmong, setSplitAmong] = useState<string[]>(expense?.splitAmong ?? trip.members.map((m) => m.id));
  const [splitMode, setSplitMode] = useState(expense?.splitMode ?? 'equal');
  const [custom, setCustom] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(expense?.customShares ?? {}).map(([k, v]) => [k, String(v)])),
  );
  const [itemId, setItemId] = useState(expense?.itemId ?? '');
  const [memo, setMemo] = useState(expense?.memo ?? '');
  const [datetime, setDatetime] = useState(() => isoToInput(expense?.datetime ?? nowIso()));
  const [error, setError] = useState('');

  // よく使う順（同じなら初期値の順）
  const categories = useLiveQuery(async () => {
    const all = await db.categories.toArray();
    return all.sort((a, b) => b.usageCount - a.usageCount || a.id.localeCompare(b.id));
  });
  const items = useLiveQuery(
    async () =>
      (await db.itineraryItems.where('tripId').equals(trip.id).toArray()).sort(
        (a, b) => a.date.localeCompare(b.date) || byOrder(a, b),
      ),
    [trip.id],
  );
  // 今の時刻にいちばん近い今日の予定（自動ではひも付けない）
  const suggestion = useMemo(() => (expense || !items ? undefined : nearestItem(items, new Date())), [expense, items]);

  const amountNum = parseYenInput(amount);
  const dayLabel = useMemo(() => new Map(tripDays(trip).map((d) => [d.date, d.label])), [trip]);
  const nameOf = (id: string) => trip.members.find((m) => m.id === id)?.name ?? '?';

  const customShares = Object.fromEntries(splitAmong.map((id) => [id, parseYenInput(custom[id] ?? '') ?? 0]));
  const customSum = Object.values(customShares).reduce((a, b) => (Number.isNaN(b) ? a : a + b), 0);

  const toggleSplit = (id: string) =>
    setSplitAmong((s) => (s.includes(id) ? s.filter((x) => x !== id) : trip.members.map((m) => m.id).filter((m) => m === id || s.includes(m))));

  /** 均等に割った額を個別の欄に入れる（金額を指定に切り替えたとき） */
  const fillEqual = () => {
    if (!amountNum || Number.isNaN(amountNum)) return setCustom({});
    const shares = sharesOf({ amount: amountNum, paidBy, splitAmong, splitMode: 'equal' });
    setCustom(Object.fromEntries(splitAmong.map((id) => [id, String(shares[id] ?? 0)])));
  };

  const save = async () => {
    const input: ExpenseInput = {
      amount: amountNum !== undefined && !Number.isNaN(amountNum) ? amountNum : 0,
      categoryId,
      paymentMethod,
      memo: memo.trim() || undefined,
      datetime: inputToIso(datetime) ?? nowIso(),
      itemId: itemId || undefined,
      paidBy,
      splitAmong,
      splitMode,
      customShares: splitMode === 'custom' ? customShares : undefined,
    };
    const err = validateExpense(input, trip.members.map((m) => m.id));
    if (err) return setError(err);
    await saveExpense(trip.id, input, expense?.id);
    showToast(`${expense ? '保存' : '記録'}しました ${formatYen(input.amount)}`);
    onClose();
  };

  const remove = async () => {
    if (!expense || !confirm('この支出を削除しますか？')) return;
    await deleteExpense(expense.id);
    showToast('支出を削除しました');
    onClose();
  };

  const equalPreview = (() => {
    if (!amountNum || Number.isNaN(amountNum) || splitAmong.length === 0) return '';
    const base = Math.floor(amountNum / splitAmong.length);
    const rest = amountNum - base * splitAmong.length;
    return `1人 ${formatYen(base)}${rest ? `（端数 ${rest}円は${nameOf(paidBy)}）` : ''}`;
  })();

  return (
    <Sheet
      tall
      title={expense ? '支出を編集' : '支出を記録'}
      onClose={onClose}
      action={
        <button type="button" className="btn btn-primary btn-small" onClick={save}>
          保存
        </button>
      }
    >
      <div className="form expense-form">
        {error && (
          <p className="errors" role="alert">
            {error}
          </p>
        )}

        <label className="amount-field">
          <span className="yen">¥</span>
          <input
            className="amount-input"
            inputMode="numeric"
            pattern="[0-9]*"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError('');
            }}
            placeholder="0"
            autoFocus
            aria-label="金額"
          />
        </label>

        <div className="cat-row" role="radiogroup" aria-label="カテゴリ">
          {categories?.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={c.id === categoryId}
              className={`cat-btn ${c.id === categoryId ? 'active' : ''}`}
              onClick={() => {
                setCategoryId(c.id);
                setError('');
              }}
            >
              <span className="cat-icon">{c.icon}</span>
              <span className="cat-name">{c.name}</span>
            </button>
          ))}
        </div>

        <div className="field">
          <span className="label">払った人</span>
          <div className="chips" role="radiogroup">
            {trip.members.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={m.id === paidBy}
                className={`pick ${m.id === paidBy ? 'active' : ''}`}
                onClick={() => setPaidBy(m.id)}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">支払い方法</span>
          <div className="chips" role="radiogroup">
            {PAYMENT_METHODS.map((pm) => (
              <button
                key={pm}
                type="button"
                role="radio"
                aria-checked={pm === paymentMethod}
                className={`pick ${pm === paymentMethod ? 'active' : ''}`}
                onClick={() => setPaymentMethod(pm)}
              >
                {PAYMENT_LABEL[pm]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <div className="label-row">
            <span className="label">割る人</span>
            <div className="seg seg-small">
              <button type="button" className={splitMode === 'equal' ? 'active' : ''} onClick={() => setSplitMode('equal')}>
                均等
              </button>
              <button
                type="button"
                className={splitMode === 'custom' ? 'active' : ''}
                onClick={() => {
                  if (splitMode !== 'custom') fillEqual();
                  setSplitMode('custom');
                }}
              >
                金額を指定
              </button>
            </div>
          </div>
          <div className="chips">
            {trip.members.map((m) => (
              <button
                key={m.id}
                type="button"
                role="checkbox"
                aria-checked={splitAmong.includes(m.id)}
                className={`pick ${splitAmong.includes(m.id) ? 'active' : ''}`}
                onClick={() => toggleSplit(m.id)}
              >
                {splitAmong.includes(m.id) ? '✓ ' : ''}
                {m.name}
              </button>
            ))}
          </div>
          {splitMode === 'equal' ? (
            equalPreview && <span className="hint">{equalPreview}</span>
          ) : (
            <div className="custom-shares">
              {splitAmong.map((id) => (
                <label key={id} className="share-row">
                  <span>{nameOf(id)}</span>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={custom[id] ?? ''}
                    onChange={(e) => setCustom((c) => ({ ...c, [id]: e.target.value }))}
                    placeholder="0"
                  />
                  <span className="muted">円</span>
                </label>
              ))}
              <div className={`hint ${amountNum && customSum !== amountNum ? 'over' : ''}`}>
                合計 {formatYen(customSum)} / {formatYen(amountNum && !Number.isNaN(amountNum) ? amountNum : 0)}
                {amountNum && !Number.isNaN(amountNum) && customSum !== amountNum
                  ? `（あと ${formatYen(amountNum - customSum)}）`
                  : ''}
                <button type="button" className="btn-text" onClick={fillEqual}>
                  均等に入れ直す
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="field">
          <span className="label">ひも付ける予定</span>
          {suggestion && itemId !== suggestion.id && (
            <button type="button" className="suggest" onClick={() => setItemId(suggestion.id)}>
              候補：{suggestion.time} {suggestion.title} <span className="suggest-go">ひも付ける</span>
            </button>
          )}
          <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">ひも付けない</option>
            {items?.map((it) => (
              <option key={it.id} value={it.id}>
                {dayLabel.get(it.date) ?? formatMd(it.date)} {it.time ?? ''} {it.title}
              </option>
            ))}
          </select>
        </div>

        <label className="field">
          <span className="label">メモ</span>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="例：抹茶パフェ" />
        </label>

        <label className="field">
          <span className="label">日時</span>
          <input type="datetime-local" value={datetime} onChange={(e) => setDatetime(e.target.value)} />
        </label>

        {expense && (
          <button type="button" className="btn btn-danger-outline btn-block" onClick={remove}>
            この支出を削除
          </button>
        )}
      </div>
    </Sheet>
  );
}
