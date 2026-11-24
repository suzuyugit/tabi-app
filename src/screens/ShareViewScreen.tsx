import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Expense, ItineraryItem, Trip } from '../db/types';
import { decodePayload } from '../lib/share';
import { countNewPacking, importShared } from '../db/shareRepo';
import { lastMyName } from '../db/tripRepo';
import { formatMd, formatRange } from '../lib/date';
import { byOrder, itemIcon, nightsOf, tripDays } from '../lib/itinerary';
import { settleCurrencyOf, settlementForTrip } from '../lib/settlement';
import { formatMoney } from '../lib/currency';
import { expenseCurrency } from '../lib/money';
import { isoDate } from '../lib/datetime';
import { navigate } from '../router';
import { showToast } from '../components/Toast';

type Props = { data: string };

/** 共有リンクを開いたときの、読むだけの画面と「自分のスマホに取り込む」 */
export function ShareViewScreen({ data }: Props) {
  const payload = useMemo(() => decodePayload(data), [data]);
  const existing = useLiveQuery(async () => (payload ? ((await db.trips.get(payload.trip.id)) ?? null) : null), [payload]);
  const myName = useLiveQuery(() => lastMyName());
  const [meId, setMeId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const isPacking = payload?.kind === 'packing';
  // 持ち物は「ないものだけ足す」ので、いくつ足されるかを出す
  const newCount = useLiveQuery(
    async () => (payload?.kind === 'packing' ? countNewPacking(payload.trip.id, payload.packing ?? []) : 0),
    [payload],
  );

  if (!payload) {
    return (
      <div className="screen">
        <header className="app-header">
          <button className="icon-btn" onClick={() => navigate({ name: 'list' })} aria-label="旅行一覧へ">‹</button>
          <h1>共有リンクを開けません</h1>
        </header>
        <main className="content">
          <p className="empty">リンクが途中で切れているか、こわれています。送った人にもう一度送ってもらってください。</p>
        </main>
      </div>
    );
  }

  const trip = { ...payload.trip, budget: 0, createdAt: '' } as Trip;
  // 「あなたは誰？」の初期値：このスマホで前に使った自分の名前と同じ人、または前に取り込んだときの自分
  const guess =
    existing?.members.find((m) => m.isMe && trip.members.some((x) => x.id === m.id))?.id ??
    trip.members.find((m) => m.name === myName)?.id ??
    '';
  const me = meId || guess;
  const nameOf = (id: string) => trip.members.find((m) => m.id === id)?.name ?? '?';

  const doImport = async () => {
    if (!me) return showToast('「あなたは誰？」を選んでください');
    if (existing && !isPacking && !confirm(`このスマホには「${existing.name}」がもうあります。共有された内容で上書きしますか？\n（予算・手持ち現金・自分の個人の支出・持ち物はそのまま残ります）`)) return;
    setBusy(true);
    const id = await importShared(payload, me);
    showToast(isPacking ? `持ち物を${newCount ?? 0}個追加しました` : '取り込みました');
    const tab = payload.kind === 'itinerary' ? 'itinerary' : payload.kind === 'settle' ? 'settle' : 'packing';
    navigate({ name: 'trip', tripId: id, tab }, { replace: true });
  };

  return (
    <div className="screen">
      <header className="app-header">
        <button className="icon-btn" onClick={() => navigate({ name: 'list' })} aria-label="旅行一覧へ">‹</button>
        <div className="header-title">
          <h1>{trip.name}</h1>
          <div className="sub">
            共有された{{ itinerary: '旅程', settle: '割り勘', packing: '持ち物' }[payload.kind]}（読むだけ）・{formatMd(isoDate(payload.sharedAt))}時点
          </div>
        </div>
      </header>

      <main className="content money">
        <section className="card">
          <div className="muted small">{formatRange(trip.startDate, trip.endDate)}</div>
          <div className="muted small">メンバー：{trip.members.map((m) => m.name).join('・')}</div>
        </section>

        {payload.kind === 'itinerary' ? (
          <SharedItinerary trip={trip} items={(payload.items ?? []) as ItineraryItem[]} kinds={payload.kinds} />
        ) : payload.kind === 'packing' ? (
          <section className="card">
            <h3 className="card-title">持ち物（{payload.packing?.length ?? 0}個）</h3>
            <ul className="shared-packing">
              {(payload.packing ?? []).map((x, i) => (
                <li key={i}>☐ {x.name}</li>
              ))}
            </ul>
          </section>
        ) : (
          <SharedSettle trip={trip} expenses={(payload.expenses ?? []) as Expense[]} payload={payload} nameOf={nameOf} />
        )}

        <section className="card import-card">
          <h3 className="card-title">自分のスマホに取り込む</h3>
          <div className="field">
            <span className="label">あなたは誰？</span>
            <div className="chips" role="radiogroup" aria-label="あなたは誰？">
              {trip.members.map((m) => (
                <button key={m.id} type="button" role="radio" aria-checked={me === m.id} className={`pick ${me === m.id ? 'active' : ''}`} onClick={() => setMeId(m.id)}>
                  {m.name}
                </button>
              ))}
            </div>
          </div>
          <p className="muted small">
            {isPacking
              ? existing
                ? `「${existing.name}」の持ち物に、このスマホにないもの ${newCount ?? 0}個を追加します（今ある持ち物はそのまま）。`
                : '新しい旅行として保存し、持ち物を入れます。'
              : existing
                ? `このスマホにある「${existing.name}」を上書きします（予算・手持ち現金・自分の個人の支出・持ち物は残ります）。`
                : '新しい旅行として保存します。'}
          </p>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={doImport}
            disabled={busy || !me || (isPacking && !!existing && newCount === 0)}
          >
            {isPacking ? (existing ? (newCount === 0 ? '追加するものはありません' : '持ち物に追加する') : '取り込む') : existing ? '上書きして取り込む' : '取り込む'}
          </button>
        </section>
      </main>
    </div>
  );
}

function SharedItinerary({ trip, items, kinds }: { trip: Trip; items: ItineraryItem[]; kinds?: { id: string; name: string; icon: string; order: number; categoryId: string }[] }) {
  const days = tripDays(trip);
  const k = kinds && kinds.length > 0 ? kinds : undefined;
  if (items.length === 0) return <p className="empty">予定はまだありません。</p>;
  const outside = items.filter((it) => !days.some((d) => d.date === it.date));
  return (
    <>
      {[...days.map((d) => ({ key: d.date, label: `${d.label} ${d.sub}`, list: items.filter((it) => it.date === d.date) })), { key: 'out', label: '日程外', list: outside }]
        .filter((g) => g.list.length > 0)
        .map((g) => (
          <section key={g.key} className="card">
            <h3 className="card-title">{g.label}</h3>
            <ul className="shared-items">
              {[...g.list].sort(byOrder).map((it) => (
                <li key={it.id}>
                  <span className="shared-time">{it.time ?? '未定'}</span>
                  <span className="shared-main">
                    <span className="shared-title">
                      {itemIcon(it, k)} {it.title}
                    </span>
                    {it.kind === 'move' && (it.from || it.to) && (
                      <span className="muted small">
                        {it.from} → {it.to}
                        {it.arrivalTime ? `（着 ${it.arrivalDate && it.arrivalDate !== it.date ? `${formatMd(it.arrivalDate)} ` : ''}${it.arrivalTime}）` : ''}
                      </span>
                    )}
                    {it.kind === 'stay' && it.checkOutDate && (
                      <span className="muted small">
                        {nightsOf(it)}泊（{formatMd(it.checkOutDate)} {it.checkOutTime ?? ''} チェックアウト）
                      </span>
                    )}
                    {it.places?.length > 0 && <span className="muted small">📍 {it.places.join('・')}</span>}
                    {it.memo && <span className="muted small">{it.memo}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </>
  );
}

function SharedSettle({
  trip,
  expenses,
  payload,
  nameOf,
}: {
  trip: Trip;
  expenses: Expense[];
  payload: NonNullable<ReturnType<typeof decodePayload>>;
  nameOf: (id: string) => string;
}) {
  const target = settleCurrencyOf(trip);
  const r = settlementForTrip(trip, expenses, payload.repayments ?? [], target);
  const cats = new Map((payload.categories ?? []).map((c) => [c.id, c]));
  return (
    <>
      <section className="card">
        <h3 className="card-title">精算表（残り）</h3>
        {r.transfers.length === 0 ? (
          <p className="muted">精算はありません。</p>
        ) : (
          <ul className="transfer-list">
            {r.transfers.map((t) => (
              <li key={`${t.from}>${t.to}`} className="transfer">
                <div className="transfer-main">
                  <span className="transfer-names">
                    {nameOf(t.from)} <span className="arrow">→</span> {nameOf(t.to)}
                  </span>
                  <span className="transfer-amount">{formatMoney(t.amount, target)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card">
        <h3 className="card-title">割り勘した支出（{expenses.length}件）</h3>
        <ul className="shared-items">
          {[...expenses]
            .sort((a, b) => a.datetime.localeCompare(b.datetime))
            .map((e) => (
              <li key={e.id}>
                <span className="shared-time">{formatMd(isoDate(e.datetime, trip.timeZone))}</span>
                <span className="shared-main">
                  <span className="shared-title">
                    {cats.get(e.categoryId)?.icon ?? '📦'} {e.memo || cats.get(e.categoryId)?.name || '支出'}
                  </span>
                  <span className="muted small">
                    {nameOf(e.paidBy)}が立て替え・{e.splitAmong.map(nameOf).join('・')}で割り勘
                  </span>
                </span>
                <span className="bd-amount">{formatMoney(e.amount, expenseCurrency(e))}</span>
              </li>
            ))}
        </ul>
      </section>
    </>
  );
}
