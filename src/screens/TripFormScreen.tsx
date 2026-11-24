import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Member } from '../db/types';
import { createTrip, CurrencyInUseError, deleteTrip, lastMyName, MemberInUseError, membersInUse, updateTrip } from '../db/tripRepo';
import { diffLabel, JST, TIME_ZONES } from '../lib/timezone';
import { CURRENCIES, currencyInfo, formatMoney, JPY, parseMoneyInput, parseRate, toInputValue } from '../lib/currency';
import { newId } from '../lib/id';
import { formatRange, todayYmd } from '../lib/date';
import { parseYenInput, validateTrip, type TripInput } from '../lib/trips';
import { navigate } from '../router';

type Props = { tripId?: string };

export function TripFormScreen({ tripId }: Props) {
  const isEdit = tripId !== undefined;
  const [loaded, setLoaded] = useState(!isEdit);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(todayYmd());
  const [endDate, setEndDate] = useState(todayYmd());
  const [budget, setBudget] = useState('');
  const [cash, setCash] = useState('');
  const [currency, setCurrency] = useState(JPY);
  const [rate, setRate] = useState('');
  const [savedCurrency, setSavedCurrency] = useState(JPY);
  const [timeZone, setTimeZone] = useState(JST);
  const [members, setMembers] = useState<Member[]>([{ id: newId(), name: '自分', isMe: true }]);
  const [copyFrom, setCopyFrom] = useState('');
  const [inUse, setInUse] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const newMemberRef = useRef<HTMLInputElement | null>(null);
  const focusNewMember = useRef(false);

  // 初期値の読み込み
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isEdit) {
        const t = await db.trips.get(tripId);
        if (cancelled) return;
        if (!t) {
          setNotFound(true);
          return;
        }
        setName(t.name);
        setStartDate(t.startDate);
        setEndDate(t.endDate);
        setBudget(t.budget ? String(t.budget) : '');
        setCash(toInputValue(t.cashOnHand, t.currency));
        setCurrency(t.currency ?? JPY);
        setSavedCurrency(t.currency ?? JPY);
        setRate(t.rate !== undefined ? String(t.rate) : '');
        setTimeZone(t.timeZone ?? JST);
        setMembers(t.members);
        setInUse(await membersInUse(t.id));
        if (!cancelled) setLoaded(true);
      } else {
        const myName = await lastMyName();
        if (!cancelled && myName) setMembers((ms) => ms.map((m) => (m.isMe ? { ...m, name: myName } : m)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, tripId]);

  // 持ち物コピー元の候補（持ち物が1つ以上ある旅行）
  const copySources = useLiveQuery(async () => {
    if (isEdit) return [];
    const [trips, items] = await Promise.all([db.trips.orderBy('startDate').reverse().toArray(), db.packingItems.toArray()]);
    const counts = new Map<string, number>();
    for (const p of items) counts.set(p.tripId, (counts.get(p.tripId) ?? 0) + 1);
    return trips.filter((t) => counts.has(t.id)).map((t) => ({ trip: t, count: counts.get(t.id)! }));
  }, [isEdit]);

  useEffect(() => {
    if (focusNewMember.current) {
      newMemberRef.current?.focus();
      focusNewMember.current = false;
    }
  }, [members.length]);

  if (notFound) {
    return (
      <div className="screen">
        <header className="app-header">
          <button className="icon-btn" onClick={() => navigate({ name: 'list' })} aria-label="戻る">‹</button>
          <h1>旅行が見つかりません</h1>
        </header>
      </div>
    );
  }
  if (!loaded) return <div className="screen" />;

  const goBack = () => {
    if (isEdit) navigate({ name: 'trip', tripId, tab: 'itinerary' }, { replace: true });
    else navigate({ name: 'list' }, { replace: true });
  };

  const addMember = () => {
    focusNewMember.current = true;
    setMembers((ms) => [...ms, { id: newId(), name: '', isMe: false }]);
  };

  const removeMember = (id: string) => setMembers((ms) => ms.filter((m) => m.id !== id));

  const renameMember = (id: string, value: string) =>
    setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, name: value } : m)));

  const onStartChange = (v: string) => {
    setStartDate(v);
    // 開始日を終了日より後にしたら、終了日を合わせる
    if (v && endDate && v > endDate) setEndDate(v);
  };

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const budgetNum = parseYenInput(budget);
    const cashNum = parseMoneyInput(cash, currency);
    const rateNum = currency === JPY ? undefined : parseRate(rate);
    const input: TripInput = {
      name: name.trim(),
      startDate,
      endDate,
      budget: budgetNum ?? 0,
      members: members.map((m) => ({ ...m, name: m.name.trim() })),
      cashOnHand: cashNum,
      currency: currency === JPY ? undefined : currency,
      rate: rateNum,
      timeZone: timeZone === JST ? undefined : timeZone,
    };
    const errs = validateTrip(input);
    setErrors(errs);
    if (errs.length > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await updateTrip(tripId, input);
        goBack();
      } else {
        const id = await createTrip(input, copyFrom || undefined);
        navigate({ name: 'trip', tripId: id, tab: 'itinerary' }, { replace: true });
      }
    } catch (e) {
      setErrors([
        e instanceof MemberInUseError || e instanceof CurrencyInUseError ? e.message : `保存できませんでした：${String(e)}`,
      ]);
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!isEdit) return;
    if (!confirm(`「${name}」を削除しますか？\n旅程・支出・持ち物もすべて消えます。元に戻せません。`)) return;
    await deleteTrip(tripId);
    navigate({ name: 'list' }, { replace: true });
  };

  return (
    <div className="screen">
      <header className="app-header">
        <button className="icon-btn" onClick={goBack} aria-label="戻る">‹</button>
        <h1>{isEdit ? '旅行を編集' : '新しい旅行'}</h1>
      </header>

      <form className="content form" onSubmit={onSubmit} noValidate>
        {errors.length > 0 && (
          <ul className="errors" role="alert">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        <label className="field">
          <span className="label">旅行の名前</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：京都 紅葉旅行" autoFocus={!isEdit} />
        </label>

        <div className="field-row">
          <label className="field">
            <span className="label">出発日</span>
            <input type="date" value={startDate} onChange={(e) => onStartChange(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">帰る日</span>
            <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
        </div>
        {startDate && endDate && startDate <= endDate && <p className="hint">{formatRange(startDate, endDate)}</p>}

        <fieldset className="field">
          <legend className="label">メンバー</legend>
          <ul className="member-list">
            {members.map((m, i) => {
              const locked = inUse.has(m.id);
              return (
                <li key={m.id} className="member-row">
                  {m.isMe && <span className="me-tag">自分</span>}
                  <input
                    ref={i === members.length - 1 ? newMemberRef : undefined}
                    value={m.name}
                    onChange={(e) => renameMember(m.id, e.target.value)}
                    placeholder={m.isMe ? 'あなたの名前' : '友人の名前'}
                    enterKeyHint="next"
                    onKeyDown={(e) => {
                      // Enter で次の友人を続けて追加できる
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        if (i === members.length - 1 && m.name.trim()) addMember();
                      }
                    }}
                  />
                  {!m.isMe && (
                    <button
                      type="button"
                      className="icon-btn danger"
                      onClick={() => removeMember(m.id)}
                      disabled={locked}
                      aria-label={`${m.name || 'このメンバー'}を外す`}
                      title={locked ? '支出に関わっているので削除できません' : '外す'}
                    >
                      ×
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {members.some((m) => !m.isMe && inUse.has(m.id)) && (
            <p className="hint">支出に関わっているメンバーは削除できません。</p>
          )}
          <button type="button" className="btn btn-ghost" onClick={addMember}>
            ＋友人を追加
          </button>
        </fieldset>

        <label className="field">
          <span className="label">予算（自分の分・円）</span>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="例：30000（空なら予算なし）"
          />
        </label>

        <fieldset className="field">
          <legend className="label">現地通貨（海外旅行のとき）</legend>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="現地通貨">
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code === JPY ? '日本円（国内旅行）' : `${c.name}（${c.code}）`}
              </option>
            ))}
          </select>
          {currency !== JPY && (
            <div className="rate-row">
              <span>1 {currency} =</span>
              <input
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="例：150.25"
                aria-label="為替レート"
              />
              <span>円</span>
            </div>
          )}
          {currency !== JPY && <RateHint currency={currency} rate={rate} />}
          {isEdit && currency !== savedCurrency && (
            <span className="hint">予定の予想費用と手持ち現金は、新しい通貨の金額として扱われます。</span>
          )}
        </fieldset>

        <label className="field">
          <span className="label">現地の時間帯（時差）</span>
          <select value={timeZone} onChange={(e) => setTimeZone(e.target.value)} aria-label="現地の時間帯">
            <option value={JST}>日本時間（国内旅行）</option>
            {TIME_ZONES.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </select>
          {timeZone !== JST && startDate && (
            <span className="hint">
              {diffLabel(timeZone, startDate)}。予定の時刻は「現地時間」か「日本時間」かを選べ、支出の日時は現地時間で記録します
            </span>
          )}
        </label>

        <label className="field">
          <span className="label">
            出発時の自分の手持ち現金（{currency === JPY ? '円' : currencyInfo(currency).name}・任意）
          </span>
          <input
            inputMode={currencyInfo(currency).decimals > 0 ? 'decimal' : 'numeric'}
            value={cash}
            onChange={(e) => setCash(e.target.value)}
            placeholder={currency === JPY ? '例：20000' : '例：300'}
            aria-label="手持ち現金"
          />
        </label>

        {!isEdit && copySources && copySources.length > 0 && (
          <label className="field">
            <span className="label">持ち物リストをコピー</span>
            <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
              <option value="">コピーしない</option>
              {copySources.map(({ trip, count }) => (
                <option key={trip.id} value={trip.id}>
                  {trip.name}（{count}個）
                </option>
              ))}
            </select>
            <span className="hint">チェックは全部外した状態でコピーします</span>
          </label>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
          {isEdit ? '保存' : '作成'}
        </button>

        {isEdit && (
          <button type="button" className="btn btn-danger-outline btn-block" onClick={onDelete}>
            この旅行を削除
          </button>
        )}
      </form>
    </div>
  );
}

/** レートの確かめ用：「$10 ≈ 1,503円」「10,000円 ≈ $66.55」 */
function RateHint({ currency, rate }: { currency: string; rate: string }) {
  const r = parseRate(rate);
  if (r === undefined) return <span className="hint">両替所やカードのレートを見て入れてください。あとから変更できます。</span>;
  if (Number.isNaN(r)) return <span className="hint over">レートは数字で入れてください</span>;
  const c = currencyInfo(currency);
  // 現地の「よくある金額」を例に出す（ウォンやドンは桁が大きい）
  const sample = (r < 1 ? 10000 : 10) * 10 ** c.decimals;
  const yen = Math.round((sample / 10 ** c.decimals) * r);
  const back = Math.round((10000 / r) * 10 ** c.decimals);
  return (
    <span className="hint">
      {formatMoney(sample, currency)} ≈ {formatMoney(yen)}　／　{formatMoney(10000)} ≈ {formatMoney(back, currency)}
    </span>
  );
}
