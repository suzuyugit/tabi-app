import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { summarizeTrip } from '../lib/summary';
import { convert, formatMoney, isForeign, JPY, tripCurrency } from '../lib/currency';
import { formatRange, formatMd } from '../lib/date';
import { isoDate } from '../lib/datetime';
import { expenseCurrency } from '../lib/money';
import { copyText } from '../lib/clipboard';
import { navigate } from '../router';
import { showToast } from '../components/Toast';

type Props = { tripId: string };

/** 旅行のまとめ（最終日を過ぎたら旅行一覧のカードから開ける） */
export function SummaryScreen({ tripId }: Props) {
  const data = useLiveQuery(async () => {
    const trip = await db.trips.get(tripId);
    if (!trip) return null;
    const [expenses, repayments, categories, items] = await Promise.all([
      db.expenses.where('tripId').equals(tripId).toArray(),
      db.repayments.where('tripId').equals(tripId).toArray(),
      db.categories.toArray(),
      db.itineraryItems.where('tripId').equals(tripId).count(),
    ]);
    return { trip, s: summarizeTrip(trip, expenses, repayments), cats: new Map(categories.map((c) => [c.id, c])), items };
  }, [tripId]);

  if (data === undefined) return <div className="screen" />;
  if (data === null) {
    return (
      <div className="screen">
        <header className="app-header">
          <button className="icon-btn" onClick={() => navigate({ name: 'list' })} aria-label="戻る">‹</button>
          <h1>旅行が見つかりません</h1>
        </header>
      </div>
    );
  }
  const { trip, s, cats } = data;
  const yen = (n: number) => formatMoney(n);
  const foreign = isForeign(trip);
  const local = tripCurrency(trip);
  const both = (n: number) => (foreign ? `${yen(n)}（≈${formatMoney(convert(n, JPY, local, trip), local)}）` : yen(n));
  const catMax = Math.max(1, ...s.byCategory.map((c) => c.value));
  const top = s.top;
  const topTitle = top ? top.expense.memo || cats.get(top.expense.categoryId)?.name || '支出' : '';

  const copy = async () => {
    const lines = [
      `【${trip.name} のまとめ】`,
      formatRange(trip.startDate, trip.endDate),
      `自分が使った額：${yen(s.mine)}${s.budgetDiff !== undefined ? `（予算 ${yen(trip.budget)}・${s.budgetDiff >= 0 ? `${yen(s.budgetDiff)} 余り` : `${yen(-s.budgetDiff)} オーバー`}）` : ''}`,
      `記録した支出の総額：${yen(s.total)}（一人あたり ${yen(s.perPerson)}）`,
      ...s.byCategory.slice(0, 5).map((c) => `・${cats.get(c.id)?.name ?? 'その他'} ${yen(c.value)}`),
    ];
    if (top) lines.push(`いちばん高かった支出：${topTitle} ${formatMoney(top.expense.amount, expenseCurrency(top.expense))}`);
    const ok = await copyText(lines.join('\n'));
    showToast(ok ? 'まとめをコピーしました' : 'コピーできませんでした');
  };

  return (
    <div className="screen">
      <header className="app-header">
        <button className="icon-btn" onClick={() => navigate({ name: 'trip', tripId, tab: 'money' })} aria-label="旅行の画面へ">
          ‹
        </button>
        <div className="header-title">
          <h1>{trip.name} のまとめ</h1>
          <div className="sub">{formatRange(trip.startDate, trip.endDate)}</div>
        </div>
        <button className="btn btn-ghost btn-small" onClick={copy}>
          📋 コピー
        </button>
      </header>

      <main className="content money">
        <section className="card">
          <div className="card-label">自分が使った額</div>
          <div className="hero">
            <span className={`hero-num ${s.budgetDiff !== undefined && s.budgetDiff < 0 ? 'over' : ''}`}>{yen(s.mine)}</span>
            {trip.budget > 0 && <span className="muted"> / 予算 {yen(trip.budget)}</span>}
          </div>
          {s.budgetDiff !== undefined && (
            <div className={`budget-rest ${s.budgetDiff < 0 ? 'over' : ''}`}>
              {s.budgetDiff >= 0 ? `🎉 予算内！ ${yen(s.budgetDiff)} 余りました` : `⚠ 予算を ${yen(-s.budgetDiff)} オーバー`}
            </div>
          )}
          {foreign && <div className="muted small">≈ {formatMoney(convert(s.mine, JPY, local, trip), local)}</div>}
        </section>

        <section className="summary-grid">
          <div className="card stat">
            <div className="card-label">記録した支出の総額</div>
            <div className="stat-num">{yen(s.total)}</div>
            <div className="muted small">{s.expenseCount}件</div>
          </div>
          <div className="card stat">
            <div className="card-label">一人あたり（総額 ÷ {trip.members.length}人）</div>
            <div className="stat-num">{yen(s.perPerson)}</div>
          </div>
          <div className="card stat">
            <div className="card-label">1日あたり（自分）</div>
            <div className="stat-num">{yen(s.minePerDay)}</div>
            <div className="muted small">{s.days}日間</div>
          </div>
          <div className="card stat">
            <div className="card-label">精算</div>
            <div className="stat-num">{trip.members.length < 2 ? '—' : s.remainingTransfers === 0 ? '✅ 済み' : `残り ${s.remainingTransfers}件`}</div>
            {s.remainingTransfers > 0 && (
              <button type="button" className="btn-text" onClick={() => navigate({ name: 'trip', tripId, tab: 'settle' })}>
                精算タブへ
              </button>
            )}
          </div>
        </section>

        {top && (
          <section className="card">
            <div className="card-label">いちばん高かった支出</div>
            <div className="top-expense">
              <span className="expense-icon">{cats.get(top.expense.categoryId)?.icon ?? '📦'}</span>
              <span className="expense-main">
                <span className="expense-title">{topTitle}</span>
                <span className="expense-sub">{formatMd(isoDate(top.expense.datetime, trip.timeZone))}</span>
              </span>
              <span className="stat-num">{formatMoney(top.expense.amount, expenseCurrency(top.expense))}</span>
            </div>
            {expenseCurrency(top.expense) !== JPY && <div className="muted small right">≈ {yen(top.yen)}</div>}
          </section>
        )}

        {s.byCategory.length > 0 && (
          <section className="card">
            <h3 className="card-title">カテゴリ別（自分の負担分）</h3>
            <ul className="hbars">
              {s.byCategory.map((c) => (
                <li key={c.id} className="hbar-row">
                  <span className="hbar-label">
                    {cats.get(c.id)?.icon ?? '📦'} {cats.get(c.id)?.name ?? 'その他'}
                  </span>
                  <span className="hbar-track">
                    <span className="hbar-fill" style={{ width: `${(c.value / catMax) * 100}%` }} />
                  </span>
                  <span className="hbar-value">
                    {yen(c.value)}
                    <span className="muted pct">{s.mine > 0 ? `${Math.round((c.value / s.mine) * 100)}%` : ''}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="muted small center">
          予定 {data.items}件・支出 {s.expenseCount}件{foreign ? `・1 ${local} = ${trip.rate}円で換算` : ''}
        </p>
        {foreign && <p className="muted small center">{both(s.total)}</p>}
      </main>
    </div>
  );
}
