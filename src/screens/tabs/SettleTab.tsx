import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import type { Trip } from '../../db/types';
import { setSettled, settledKeys } from '../../db/settlementRepo';
import { settlementForTrip, type Transfer } from '../../lib/settlement';
import { formatMoney, isForeign, tripCurrency } from '../../lib/currency';
import { copyText } from '../../lib/clipboard';
import { showToast } from '../../components/Toast';

type Props = { trip: Trip };

const keyOf = (t: Transfer) => `${t.from}>${t.to}`;

export function SettleTab({ trip }: Props) {
  const data = useLiveQuery(async () => {
    const expenses = await db.expenses.where('tripId').equals(trip.id).toArray();
    const result = settlementForTrip(trip, expenses);
    const done = await settledKeys(trip.id, result.transfers);
    return { count: expenses.length, ...result, done };
  }, [trip]);

  if (!data) return null;
  const nameOf = (id: string) => trip.members.find((m) => m.id === id)?.name ?? '（削除されたメンバー）';
  const meId = trip.members.find((m) => m.isMe)?.id;
  const foreign = isForeign(trip);
  const yen = (n: number) => formatMoney(n);
  const allDone = data.transfers.length > 0 && data.transfers.every((t) => data.done.has(keyOf(t)));

  const copy = async () => {
    const lines = [
      `【${trip.name} 精算】`,
      ...data.transfers.map((t) => `${nameOf(t.from)} → ${nameOf(t.to)}：${yen(t.amount)}${data.done.has(keyOf(t)) ? '（済）' : ''}`),
    ];
    if (foreign) lines.push(`※ 1 ${tripCurrency(trip)} = ${trip.rate}円で換算`);
    const ok = await copyText(lines.join('\n'));
    showToast(ok ? '精算表をコピーしました' : 'コピーできませんでした');
  };

  if (trip.members.length < 2) {
    return <p className="empty">メンバーが1人なので精算はありません。旅行の編集画面で友人を追加できます。</p>;
  }
  if (data.count === 0) {
    return <p className="empty">まだ支出がありません。右下の＋から記録すると、ここに精算表が出ます。</p>;
  }

  return (
    <div className="money">
      <section className="card">
        <div className="settle-head">
          <h3 className="card-title">精算表</h3>
          {data.transfers.length > 0 && (
            <button type="button" className="btn btn-ghost btn-small" onClick={copy}>
              📋 テキストでコピー
            </button>
          )}
        </div>
        {data.transfers.length === 0 ? (
          <p className="muted">全員の負担がぴったりなので、精算はいりません 🎉</p>
        ) : (
          <>
            <ul className="transfer-list">
              {data.transfers.map((t) => {
                const done = data.done.has(keyOf(t));
                const mine = t.from === meId || t.to === meId;
                return (
                  <li key={keyOf(t)}>
                    <label className={`transfer ${done ? 'done' : ''} ${mine ? 'mine' : ''}`}>
                      <input type="checkbox" checked={done} onChange={(e) => setSettled(trip.id, t, e.target.checked)} />
                      <span className="transfer-names">
                        {nameOf(t.from)} <span className="arrow">→</span> {nameOf(t.to)}
                      </span>
                      <span className="transfer-amount">{yen(t.amount)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="muted small">
              {allDone ? '✅ 精算はすべて済みました。' : '済んだらチェックを入れてください。支出を変えるとチェックは外れます。'}
              {foreign && ` 円で精算します（1 ${tripCurrency(trip)} = ${trip.rate}円で換算）。`}
            </p>
          </>
        )}
      </section>

      <section className="card">
        <h3 className="card-title">メンバーごと</h3>
        <table className="settle-table">
          <thead>
            <tr>
              <th scope="col">名前</th>
              <th scope="col">立て替えた額</th>
              <th scope="col">負担する額</th>
              <th scope="col">差額</th>
            </tr>
          </thead>
          <tbody>
            {data.balances.map((b) => (
              <tr key={b.memberId} className={b.memberId === meId ? 'me' : ''}>
                <th scope="row">{nameOf(b.memberId)}</th>
                <td>{yen(b.paid)}</td>
                <td>{yen(b.owed)}</td>
                <td className={b.diff > 0 ? 'plus' : b.diff < 0 ? 'minus' : ''}>
                  {b.diff > 0 ? '+' : ''}
                  {yen(b.diff)}
                  <span className="diff-note">{b.diff > 0 ? '受け取る' : b.diff < 0 ? '払う' : '±0'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
