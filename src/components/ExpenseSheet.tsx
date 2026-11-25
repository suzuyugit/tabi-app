import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Expense, PaymentMethod, RoundMode, Trip } from '../db/types';
import { deleteExpense, lastPaymentMethod, rateToRecord, saveExpense, type ExpenseInput } from '../db/expenseRepo';
import { inputToIso, isoToInput, nowIso } from '../lib/datetime';
import { byOrder, nearestItem, tripDays } from '../lib/itinerary';
import { hasTimeDiff, nowWall } from '../lib/timezone';
import { formatMd } from '../lib/date';
import { currencyInfo, formatMoney, isForeign, JPY, parseMoneyInput, toInputValue, tripCurrency } from '../lib/currency';
import { convertExpense, expenseCurrency } from '../lib/money';
import { PAYMENT_LABEL, PAYMENT_METHODS, ROUND_MODE_LABEL, roundTo, roundUnitsFor, sharesOf, validateExpense } from '../lib/split';
import { Sheet } from './Sheet';
import { IconNameSheet } from './IconNameSheet';
import { useCategories } from '../hooks/useKinds';
import { showToast } from './Toast';

type Props = { trip: Trip; expense?: Expense; onClose: () => void };

/** 支出のクイック入力（編集にも使う）。最短で「金額 → カテゴリ → 保存」 */
export function ExpenseSheet({ trip, expense, onClose }: Props) {
  const me = trip.members.find((m) => m.isMe) ?? trip.members[0];
  const local = tripCurrency(trip);
  const foreign = isForeign(trip);
  // 海外では最初は現地通貨。日本で払った分などは「円」に切り替える
  const [currency, setCurrency] = useState(expense ? expenseCurrency(expense) : local);
  const [amount, setAmount] = useState(expense ? toInputValue(expense.amount, expenseCurrency(expense)) : '');
  const [categoryId, setCategoryId] = useState(expense?.categoryId ?? '');
  const [paidBy, setPaidBy] = useState(expense?.paidBy ?? me.id);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(expense?.paymentMethod ?? lastPaymentMethod());
  // 基本は割り勘しない（払った人の個人の支出）。「割り勘する」をオンにしたときだけ割る人を選ぶ
  // 個人の支出 = 自分が払って自分だけの負担。前に記録した「友人の個人の支出」は割り勘オンとして開く（払った人を残すため）
  const isPersonal = (e: Expense) =>
    e.splitAmong.length === 1 && e.splitAmong[0] === e.paidBy && e.splitMode === 'equal' && e.paidBy === me.id;
  const [shared, setShared] = useState(expense ? !isPersonal(expense) : false);
  const [splitAmong, setSplitAmong] = useState<string[]>(
    expense && !isPersonal(expense) ? expense.splitAmong : trip.members.map((m) => m.id),
  );
  const [splitMode, setSplitMode] = useState(expense?.splitMode ?? 'equal');
  // ざっくり（端数をきりのいい額に）。0 = そのまま
  const [roundUnit, setRoundUnit] = useState(expense?.roundUnit ?? 0);
  const [roundMode, setRoundMode] = useState<RoundMode>(expense?.roundMode ?? 'up');
  const [custom, setCustom] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(expense?.customShares ?? {}).map(([k, v]) => [k, toInputValue(v, expenseCurrency(expense!))])),
  );
  const [itemId, setItemId] = useState(expense?.itemId ?? '');
  const [memo, setMemo] = useState(expense?.memo ?? '');
  // 時差のある旅行では、日時は現地時間で入れる
  const tz = trip.timeZone;
  const [datetime, setDatetime] = useState(() => isoToInput(expense?.datetime ?? nowIso(tz), tz));
  const [error, setError] = useState('');

  // よく使う順（同じなら初期値の順）
  const categories = useCategories();
  const [addingCat, setAddingCat] = useState(false);
  const items = useLiveQuery(
    async () =>
      (await db.itineraryItems.where('tripId').equals(trip.id).toArray()).sort(
        (a, b) => a.date.localeCompare(b.date) || byOrder(a, b),
      ),
    [trip.id],
  );
  // 今の時刻にいちばん近い今日の予定（自動ではひも付けない）
  const suggestion = useMemo(() => {
    if (expense || !items) return undefined;
    const w = nowWall(trip); // 現地の今
    return nearestItem(items, new Date(`${w.date}T${w.time}`));
  }, [expense, items, trip]);

  const amountNum = parseMoneyInput(amount, currency);
  const amountOk = amountNum !== undefined && !Number.isNaN(amountNum);
  const fmt = (minor: number) => formatMoney(minor, currency);
  const cinfo = currencyInfo(currency);
  const dayLabel = useMemo(() => new Map(tripDays(trip).map((d) => [d.date, d.label])), [trip]);
  const nameOf = (id: string) => trip.members.find((m) => m.id === id)?.name ?? '?';

  const customShares = Object.fromEntries(splitAmong.map((id) => [id, parseMoneyInput(custom[id] ?? '', currency) ?? 0]));
  const customSum = Object.values(customShares).reduce((a, b) => (Number.isNaN(b) ? a : a + b), 0);

  const toggleSplit = (id: string) =>
    setSplitAmong((s) => (s.includes(id) ? s.filter((x) => x !== id) : trip.members.map((m) => m.id).filter((m) => m === id || s.includes(m))));

  /** 均等に割った額を個別の欄に入れる（金額を指定に切り替えたとき） */
  const fillEqual = () => {
    if (!amountOk || !amountNum) return setCustom({});
    // 端数の単位を選んでいれば、ざっくりで均等に入れる
    const shares = sharesOf({
      amount: amountNum,
      paidBy,
      splitAmong,
      splitMode: 'equal',
      roundUnit: roundOn ? roundUnit : undefined,
      roundMode,
    });
    setCustom(Object.fromEntries(splitAmong.map((id) => [id, toInputValue(shares[id] ?? 0, currency)])));
  };

  const save = async () => {
    const input: ExpenseInput = {
      amount: amountOk ? amountNum : 0,
      currency: currency === JPY ? undefined : currency,
      categoryId,
      paymentMethod,
      memo: memo.trim() || undefined,
      datetime: inputToIso(datetime, tz) ?? nowIso(tz),
      itemId: itemId || undefined,
      // 割り勘しないときは「自分が払って自分だけの負担」＝個人の支出
      paidBy: shared ? paidBy : me.id,
      splitAmong: shared ? splitAmong : [me.id],
      splitMode: shared ? splitMode : 'equal',
      customShares: shared && splitMode === 'custom' ? customShares : undefined,
      roundUnit: useRound ? roundUnit : undefined,
      roundMode: useRound ? roundMode : undefined,
    };
    const err = validateExpense(input, trip.members.map((m) => m.id));
    if (err) return setError(err);
    await saveExpense(trip.id, input, expense?.id);
    showToast(`${expense ? '保存' : '記録'}しました ${fmt(input.amount)}`);
    onClose();
  };

  const remove = async () => {
    if (!expense || !confirm('この支出を削除しますか？')) return;
    await deleteExpense(expense.id);
    showToast('支出を削除しました');
    onClose();
  };

  const roundUnits = roundUnitsFor(currency);
  // 通貨を変えたなどで単位が候補にないときは「そのまま」
  const roundOn = roundUnits.some((u) => u.unit === roundUnit);
  const useRound = shared && splitMode === 'equal' && roundOn;

  /** 金額を指定：今の額のうち、払った人以外をその単位に丸め、ずれは払った人の欄で合わせる */
  const roundCustom = () => {
    if (!roundOn || !amountOk || !amountNum || !splitAmong.includes(paidBy)) return;
    const next: Record<string, string> = {};
    let others = 0;
    for (const id of splitAmong) {
      if (id === paidBy) continue;
      const v = parseMoneyInput(custom[id] ?? '', currency);
      const r = v === undefined || Number.isNaN(v) ? 0 : roundTo(v, roundUnit, roundMode);
      next[id] = toInputValue(r, currency);
      others += r;
    }
    if (amountNum - others < 0) return setError('丸めると払った人の負担がマイナスになります');
    next[paidBy] = toInputValue(amountNum - others, currency);
    setCustom(next);
    setError('');
  };

  // 端数（ざっくり）の選択。均等でも金額を指定でも使う
  const roundControls = (
    <div className="round-row">
      <span className="muted small">端数</span>
      <select
        value={roundOn ? roundUnit : 0}
        onChange={(e) => setRoundUnit(Number(e.target.value))}
        aria-label="端数"
      >
        <option value={0}>そのまま</option>
        {roundUnits.map((u) => (
          <option key={u.unit} value={u.unit}>
            {u.label}単位
          </option>
        ))}
      </select>
      {roundOn && (
        <div className="seg seg-small" role="radiogroup" aria-label="丸め方">
          {(['up', 'nearest', 'down'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={roundMode === m}
              className={roundMode === m ? 'active' : ''}
              onClick={() => setRoundMode(m)}
            >
              {ROUND_MODE_LABEL[m]}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const equalPreview = (() => {
    if (!amountOk || !amountNum || splitAmong.length === 0) return '';
    if (useRound) {
      const shares = sharesOf({ amount: amountNum, paidBy, splitAmong, splitMode: 'equal', roundUnit, roundMode });
      const others = splitAmong.filter((id) => id !== paidBy);
      if (splitAmong.includes(paidBy) && others.length > 0 && shares[others[0]] % roundUnit === 0) {
        return `${others.map(nameOf).join('・')} ${fmt(shares[others[0]])}／${nameOf(paidBy)}（払った人）${fmt(shares[paidBy])}`;
      }
    }
    const base = Math.floor(amountNum / splitAmong.length);
    const rest = amountNum - base * splitAmong.length;
    return `1人 ${fmt(base)}${rest ? `（端数 ${fmt(rest)}は${nameOf(paidBy)}）` : ''}`;
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

        <div className="amount-row">
        <label className="amount-field">
          <span className="yen">{cinfo.symbol.trim()}</span>
          <input
            className="amount-input"
            inputMode={cinfo.decimals > 0 ? 'decimal' : 'numeric'}
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
        {foreign && (
          <div className="cur-toggle" role="radiogroup" aria-label="通貨">
            {[local, JPY].map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={c === currency}
                className={c === currency ? 'active' : ''}
                // 金額欄からフォーカスを奪わない（キーボードを閉じない）
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => setCurrency(c)}
              >
                {c === JPY ? '円' : c}
              </button>
            ))}
          </div>
        )}
        </div>
        {foreign && amountOk && amountNum > 0 && (
          <div className="converted">
            ≈ {formatMoney(convertExpense(amountNum, { currency, rateAtRecord: rateToRecord({ currency }, expense, trip.rate) }, currency === JPY ? local : JPY, trip), currency === JPY ? local : JPY)}
          </div>
        )}

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
          <button type="button" className="cat-btn add-tile" onClick={() => setAddingCat(true)}>
            <span className="cat-icon">＋</span>
            <span className="cat-name">追加</span>
          </button>
        </div>
        {addingCat && (
          <IconNameSheet
            mode="category"
            onClose={() => setAddingCat(false)}
            onSaved={(id) => {
              setCategoryId(id);
              setError('');
            }}
          />
        )}

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

        {trip.members.length > 1 && (
          <div className="field">
            <div className="label-row">
              <label className="switch-row">
                <input type="checkbox" role="switch" checked={shared} onChange={(e) => setShared(e.target.checked)} />
                <span className="switch" aria-hidden="true" />
                <span className="label">割り勘する</span>
              </label>
              {shared && (
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
              )}
            </div>
            {shared ? (
              <>
                <span className="label sub-label">払った人</span>
                <div className="chips" role="radiogroup" aria-label="払った人">
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
                <span className="label sub-label">割る人</span>
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
                <>
                  {roundControls}
                  {equalPreview && <span className="hint">{equalPreview}</span>}
                </>
              ) : (
                <div className="custom-shares">
                  {splitAmong.map((id) => (
                    <label key={id} className="share-row">
                      <span>{nameOf(id)}</span>
                      <input
                        inputMode={cinfo.decimals > 0 ? 'decimal' : 'numeric'}
                        value={custom[id] ?? ''}
                        onChange={(e) => setCustom((c) => ({ ...c, [id]: e.target.value }))}
                        placeholder="0"
                      />
                      <span className="muted">{currency === JPY ? '円' : currency}</span>
                    </label>
                  ))}
                  <div className={`hint ${amountOk && customSum !== amountNum ? 'over' : ''}`}>
                    合計 {fmt(customSum)} / {fmt(amountOk ? amountNum : 0)}
                    {amountOk && customSum !== amountNum ? `（あと ${fmt(amountNum - customSum)}）` : ''}
                  </div>
                  {roundControls}
                  <div className="custom-actions">
                    <button type="button" className="btn btn-ghost btn-small" onClick={fillEqual}>
                      均等に入れ直す{roundOn ? '（ざっくり）' : ''}
                    </button>
                    {roundOn && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={roundCustom}
                        disabled={!splitAmong.includes(paidBy)}
                        title={splitAmong.includes(paidBy) ? '' : '払った人が割る人に入っていないとそろえられません'}
                      >
                        端数をそろえる
                      </button>
                    )}
                  </div>
                </div>
              )}
              </>
            ) : (
              <span className="hint">自分の個人の支出として記録します</span>
            )}
          </div>
        )}

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
                {dayLabel.get(it.date) ?? formatMd(it.date)} {it.time ?? '未定'} {it.title}
              </option>
            ))}
          </select>
        </div>

        <label className="field">
          <span className="label">メモ</span>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="例：抹茶パフェ" />
        </label>

        <label className="field">
          <span className="label">日時{hasTimeDiff(trip) ? '（現地時間）' : ''}</span>
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
