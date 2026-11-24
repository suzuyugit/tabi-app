import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import type { Trip } from '../../db/types';
import { addRepayment, deleteRepayment } from '../../db/repaymentRepo';
import { memberBreakdown, settleCurrencyOf, settlementForTrip, type Transfer } from '../../lib/settlement';
import { convert, currencyInfo, formatMoney, isForeign, JPY, parseMoneyInput, tripCurrency } from '../../lib/currency';
import { isoDate, nowIso } from '../../lib/datetime';
import { formatMd } from '../../lib/date';
import { copyText } from '../../lib/clipboard';
import { showToast } from '../../components/Toast';
import { Sheet } from '../../components/Sheet';

type Props = { trip: Trip };

export function SettleTab({ trip }: Props) {
  const [repaying, setRepaying] = useState<Transfer | null>(null);
  // 精算する通貨（円か現地通貨）。旅行ごとに覚えておく
  const target = settleCurrencyOf(trip);
  const yen = (n: number) => formatMoney(n, target);
  const setTarget = (c: string) => db.trips.update(trip.id, { settleCurrency: c === JPY ? undefined : c });

  const data = useLiveQuery(async () => {
    const [expenses, repayments, categories] = await Promise.all([
      db.expenses.where('tripId').equals(trip.id).toArray(),
      db.repayments.where('tripId').equals(trip.id).toArray(),
      db.categories.toArray(),
    ]);
    repayments.sort((a, b) => a.datetime.localeCompare(b.datetime));
    const cats = new Map(categories.map((c) => [c.id, c]));
    return { expenses, repayments, cats, ...settlementForTrip(trip, expenses, repayments, target) };
  }, [trip]);

  if (!data) return null;
  const nameOf = (id: string) => trip.members.find((m) => m.id === id)?.name ?? '（削除されたメンバー）';
  const meId = trip.members.find((m) => m.isMe)?.id;
  const foreign = isForeign(trip);
  const titleOf = (e: { memo?: string; categoryId: string }) => {
    const c = data.cats.get(e.categoryId);
    return `${c?.icon ?? ''} ${e.memo || c?.name || '支出'}`.trim();
  };
  const sharedCount = data.expenses.filter((e) => !(e.splitAmong.length === 1 && e.splitAmong[0] === e.paidBy)).length;

  const payAll = async (t: Transfer) => {
    await addRepayment({
      tripId: trip.id,
      from: t.from,
      to: t.to,
      amount: t.amount,
      currency: target === JPY ? undefined : target,
      datetime: nowIso(trip.timeZone),
    });
    showToast(`${nameOf(t.from)} → ${nameOf(t.to)} ${yen(t.amount)} を精算済みにしました`);
  };

  const copy = async () => {
    const lines = [`【${trip.name} 精算】`];
    if (data.transfers.length === 0) lines.push('精算はすべて済みました');
    for (const t of data.transfers) lines.push(`${nameOf(t.from)} → ${nameOf(t.to)}：${yen(t.amount)}`);
    if (data.repayments.length > 0) {
      lines.push('', '（もう渡した分）');
      for (const r of data.repayments)
        lines.push(`${formatMd(isoDate(r.datetime, trip.timeZone))} ${nameOf(r.from)} → ${nameOf(r.to)}：${formatMoney(r.amount, r.currency)}`);
    }
    if (foreign) lines.push(`※ ${target === JPY ? '円' : target}で精算（1 ${tripCurrency(trip)} = ${trip.rate}円で換算）`);
    const ok = await copyText(lines.join('\n'));
    showToast(ok ? '精算表をコピーしました' : 'コピーできませんでした');
  };

  if (trip.members.length < 2) {
    return <p className="empty">メンバーが1人なので精算はありません。旅行の編集画面で友人を追加できます。</p>;
  }
  if (sharedCount === 0 && data.repayments.length === 0) {
    return <p className="empty">割り勘した支出はまだありません。支出の入力で「割り勘する」をオンにすると、ここに精算表が出ます。</p>;
  }

  return (
    <div className="money">
      {foreign && (
        <div className="seg" role="radiogroup" aria-label="精算する通貨">
          {[JPY, tripCurrency(trip)].map((c) => (
            <button key={c} type="button" role="radio" aria-checked={target === c} className={target === c ? 'active' : ''} onClick={() => setTarget(c)}>
              {c === JPY ? '円' : `${currencyInfo(c).name}（${c}）`}で精算
            </button>
          ))}
        </div>
      )}
      <section className="card">
        <div className="settle-head">
          <h3 className="card-title">精算表（残り）</h3>
          <button type="button" className="btn btn-ghost btn-small" onClick={copy}>
            📋 テキストでコピー
          </button>
        </div>
        {data.transfers.length === 0 ? (
          <p className="muted">{data.repayments.length > 0 ? '✅ 精算はすべて済みました。' : '全員の負担がぴったりなので、精算はいりません 🎉'}</p>
        ) : (
          <ul className="transfer-list">
            {data.transfers.map((t) => (
              <li key={`${t.from}>${t.to}`} className={`transfer ${t.from === meId || t.to === meId ? 'mine' : ''}`}>
                <div className="transfer-main">
                  <span className="transfer-names">
                    {nameOf(t.from)} <span className="arrow">→</span> {nameOf(t.to)}
                  </span>
                  <span className="transfer-amount">{yen(t.amount)}</span>
                </div>
                <div className="transfer-actions">
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => setRepaying(t)}>
                    一部返した
                  </button>
                  <button type="button" className="btn btn-primary btn-small" onClick={() => payAll(t)}>
                    全額返した
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {foreign && (
          <p className="muted small">
            {target === JPY ? '円' : target}で精算します（1 {tripCurrency(trip)} = {trip.rate}円で換算）。もう渡したお金は、渡した通貨のまま記録して換算して差し引きます。
          </p>
        )}
      </section>

      <section className="card">
        <h3 className="card-title">メンバーごと</h3>
        <ul className="member-cards">
          {data.balances.map((b) => {
            const d = memberBreakdown(trip, data.expenses, b.memberId, titleOf, target);
            return (
              <li key={b.memberId} className={`member-card ${b.memberId === meId ? 'me' : ''}`}>
                <div className="member-card-head">
                  <span className="member-name">
                    {nameOf(b.memberId)}
                    {b.memberId === meId && <span className="me-tag">自分</span>}
                  </span>
                  <span className={`member-diff ${b.diff > 0 ? 'plus' : b.diff < 0 ? 'minus' : ''}`}>
                    {b.diff > 0 ? `${yen(b.diff)} 受け取る` : b.diff < 0 ? `${yen(-b.diff)} 払う` : '精算なし'}
                  </span>
                </div>
                <div className="member-nums">
                  <span>立て替えた {yen(b.paid)}</span>
                  <span>負担する {yen(b.owed)}</span>
                  {(b.sent ?? 0) > 0 && <span>もう渡した {yen(b.sent!)}</span>}
                  {(b.received ?? 0) > 0 && <span>もう受け取った {yen(b.received!)}</span>}
                </div>
                {(d.advanced.length > 0 || d.owes.length > 0) && (
                  <details className="breakdown">
                    <summary>内訳を見る</summary>
                    {d.advanced.length > 0 && (
                      <>
                        <div className="breakdown-title">立て替えた支出</div>
                        <ul>
                          {d.advanced.map((l) => (
                            <li key={l.expenseId}>
                              <span className="muted small">{formatMd(isoDate(l.datetime, trip.timeZone))}</span>
                              <span className="bd-title">{l.title}</span>
                              <span className="bd-amount">
                                {yen(l.amount)}
                                <span className="bd-sub">ほかの人の分 {yen(l.others)}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {d.owes.length > 0 && (
                      <>
                        <div className="breakdown-title">負担する支出（ほかの人が立て替え）</div>
                        <ul>
                          {d.owes.map((l) => (
                            <li key={l.expenseId}>
                              <span className="muted small">{formatMd(isoDate(l.datetime, trip.timeZone))}</span>
                              <span className="bd-title">
                                {l.title}
                                <span className="bd-sub">{nameOf(l.payer)}が立て替え（{yen(l.amount)}）</span>
                              </span>
                              <span className="bd-amount">{yen(l.share)}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {data.repayments.length > 0 && (
        <section className="card">
          <h3 className="card-title">渡したお金の記録</h3>
          <ul className="repay-list">
            {data.repayments.map((r) => (
              <li key={r.id}>
                <span className="muted small">{formatMd(isoDate(r.datetime, trip.timeZone))}</span>
                <span className="bd-title">
                  {nameOf(r.from)} → {nameOf(r.to)}
                  {r.memo && <span className="bd-sub">{r.memo}</span>}
                </span>
                <span className="bd-amount">
                  {formatMoney(r.amount, r.currency)}
                  {(r.currency ?? JPY) !== target && <span className="bd-sub">≈ {yen(convert(r.amount, r.currency ?? JPY, target, trip))}</span>}
                </span>
                <button
                  type="button"
                  className="icon-btn danger"
                  aria-label="この記録を消す"
                  onClick={async () => {
                    if (!confirm(`${nameOf(r.from)} → ${nameOf(r.to)} ${formatMoney(r.amount, r.currency)} の記録を消しますか？`)) return;
                    await deleteRepayment(r.id);
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <p className="muted small">間違えて記録したときは × で消せます。消すと精算表の残りに戻ります。</p>
        </section>
      )}

      {repaying && (
        <RepaySheet
          trip={trip}
          currency={target}
          transfer={repaying}
          fromName={nameOf(repaying.from)}
          toName={nameOf(repaying.to)}
          onClose={() => setRepaying(null)}
        />
      )}
    </div>
  );
}

/** 一部だけ返したときの入力 */
function RepaySheet({
  trip,
  currency,
  transfer,
  fromName,
  toName,
  onClose,
}: {
  trip: Trip;
  currency: string;
  transfer: Transfer;
  fromName: string;
  toName: string;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState('');
  const n = parseMoneyInput(amount, currency);
  const yen = (v: number) => formatMoney(v, currency);
  const info = currencyInfo(currency);

  const save = async () => {
    if (n === undefined || Number.isNaN(n) || n <= 0) return setError('返した額を入れてください');
    await addRepayment({
      tripId: trip.id,
      from: transfer.from,
      to: transfer.to,
      amount: n,
      currency: currency === JPY ? undefined : currency,
      datetime: nowIso(trip.timeZone),
      memo: memo.trim() || undefined,
    });
    showToast(`${fromName} → ${toName} ${yen(n)} を記録しました`);
    onClose();
  };

  return (
    <Sheet
      title="一部だけ返した"
      onClose={onClose}
      action={
        <button type="button" className="btn btn-primary btn-small" onClick={save}>
          記録
        </button>
      }
    >
      <div className="form">
        <p className="muted">
          {fromName} → {toName}（残り {yen(transfer.amount)}）
        </p>
        {error && (
          <p className="errors" role="alert">
            {error}
          </p>
        )}
        <label className="field">
          <span className="label">返した額（{currency === JPY ? '円' : info.name}）</span>
          <input
            inputMode={info.decimals > 0 ? 'decimal' : 'numeric'}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={currency === JPY ? '例：5000' : '例：50'}
            autoFocus
          />
        </label>
        {n !== undefined && !Number.isNaN(n) && n > 0 && (
          <p className={`hint ${n > transfer.amount ? 'over' : ''}`}>
            {n >= transfer.amount
              ? n > transfer.amount
                ? `残りより ${yen(n - transfer.amount)} 多いです（多い分は逆向きの精算になります）`
                : 'これで全額です'
              : `あと ${yen(transfer.amount - n)} 残ります`}
          </p>
        )}
        <label className="field">
          <span className="label">メモ（任意）</span>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="例：PayPay で送金" />
        </label>
      </div>
    </Sheet>
  );
}
