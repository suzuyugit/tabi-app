import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Expense, ItineraryItem, Trip } from '../db/types';
import { decodePayload, type ListPayload, type TripPayload } from '../lib/share';
import { importAsViewer, importShared } from '../db/shareRepo';
import { lastMyName } from '../db/tripRepo';
import { countMissingPacking, putPackingNames, savePackingList } from '../db/packingRepo';
import { PutButtons } from '../components/PackingListSheets';
import { formatMd, formatRange } from '../lib/date';
import { byOrder, itemIcon, nightsOf, tripDays } from '../lib/itinerary';
import { settleCurrencyOf, settlementForTrip } from '../lib/settlement';
import { formatMoney } from '../lib/currency';
import { expenseCurrency } from '../lib/money';
import { isoDate } from '../lib/datetime';
import { sortTrips } from '../lib/trips';
import { navigate } from '../router';
import { showToast } from '../components/Toast';

type Props = { data: string };

/** 共有リンクを開いたときの、読むだけの画面と「自分のスマホに取り込む」 */
export function ShareViewScreen({ data }: Props) {
  const payload = useMemo(() => decodePayload(data), [data]);
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
  if (payload.kind === 'packing') return <PackingShareView payload={payload} />;
  return payload.audience === 'others' ? <ViewerShareView payload={payload} /> : <TripShareView payload={payload} />;
}

/** 持ち物リストだけの共有：旅行の持ち物に入れるか、名前を付けて保存する */
function PackingShareView({ payload }: { payload: ListPayload }) {
  const { list } = payload;
  const trips = useLiveQuery(async () => sortTrips(await db.trips.toArray()));
  const [tripId, setTripId] = useState('');
  const [listName, setListName] = useState(list.name);
  const target = tripId || trips?.[0]?.id || '';
  const missing = useLiveQuery(async () => (target ? countMissingPacking(target, list.items) : 0), [target, list.items]);
  const targetName = trips?.find((t) => t.id === target)?.name ?? '';

  const toTrip = async (mode: 'merge' | 'replace') => {
    if (!target) return;
    if (mode === 'replace' && !confirm(`「${targetName}」の持ち物を、このリスト（${list.items.length}個）に入れ替えますか？\n今ある持ち物とチェックは消えます。`)) return;
    const n = await putPackingNames(target, list.items, mode);
    showToast(mode === 'replace' ? `持ち物を入れ替えました（${list.items.length}個）` : `持ち物を${n}個追加しました`);
    navigate({ name: 'trip', tripId: target, tab: 'packing' }, { replace: true });
  };

  const saveList = async () => {
    if (!listName.trim()) return showToast('リストの名前を入れてください');
    const newId = await savePackingList(listName, list.items);
    showToast(`「${listName.trim()}」を保存しました`);
    navigate({ name: 'packingList', id: newId }, { replace: true });
  };

  return (
    <div className="screen">
      <header className="app-header">
        <button className="icon-btn" onClick={() => navigate({ name: 'list' })} aria-label="旅行一覧へ">‹</button>
        <div className="header-title">
          <h1>{list.name}</h1>
          <div className="sub">共有された持ち物リスト（読むだけ）・{formatMd(isoDate(payload.sharedAt))}時点</div>
        </div>
      </header>
      <main className="content money">
        <section className="card">
          <h3 className="card-title">持ち物（{list.items.length}個）</h3>
          <ul className="shared-packing">
            {list.items.map((x, i) => (
              <li key={i}>☐ {x}</li>
            ))}
          </ul>
        </section>

        <section className="card import-card">
          <h3 className="card-title">旅行の持ち物に入れる</h3>
          {trips && trips.length === 0 ? (
            <p className="muted small">このスマホにはまだ旅行がありません。下の「持ち物リストとして保存」をしておくと、旅行を作るときにコピーできます。</p>
          ) : (
            <>
              <label className="field">
                <span className="label">入れる旅行</span>
                <select value={target} onChange={(e) => setTripId(e.target.value)} aria-label="入れる旅行">
                  {trips?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}（{formatRange(t.startDate, t.endDate)}）
                    </option>
                  ))}
                </select>
              </label>
              <PutButtons missing={missing} total={list.items.length} disabled={!target} onPut={toTrip} />
            </>
          )}
        </section>

        <section className="card">
          <h3 className="card-title">持ち物リストとして保存</h3>
          <p className="muted small">名前を付けて保存しておくと、旅行を作るときや持ち物タブから何度でも使えます。</p>
          <div className="list-save-row">
            <input value={listName} onChange={(e) => setListName(e.target.value)} aria-label="リストの名前" />
            <button type="button" className="btn btn-ghost" onClick={saveList}>
              💾 保存
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

/** 一緒に行かない人（親・参考にしたい人）に送られた旅程 */
function ViewerShareView({ payload }: { payload: TripPayload }) {
  const existing = useLiveQuery(async () => (await db.trips.get(payload.trip.id)) ?? null, [payload]);
  const myName = useLiveQuery(() => lastMyName());
  const [busy, setBusy] = useState(false);
  const trip = { ...payload.trip, budget: 0, createdAt: '' } as Trip;

  const save = async () => {
    if (existing && !confirm(`このスマホには「${existing.name}」がもうあります。共有された旅程で予定を入れ替えますか？\n（自分で変えた予定は消えます）`)) return;
    setBusy(true);
    const id = await importAsViewer(payload, myName ?? '');
    showToast('保存しました');
    navigate({ name: 'trip', tripId: id, tab: 'itinerary' }, { replace: true });
  };

  return (
    <div className="screen">
      <header className="app-header">
        <button className="icon-btn" onClick={() => navigate({ name: 'list' })} aria-label="旅行一覧へ">‹</button>
        <div className="header-title">
          <h1>{trip.name}</h1>
          <div className="sub">共有された旅程（読むだけ）・{formatMd(isoDate(payload.sharedAt))}時点</div>
        </div>
      </header>
      <main className="content money">
        <section className="card">
          <div className="muted small">{formatRange(trip.startDate, trip.endDate)}</div>
        </section>
        <SharedItinerary trip={trip} items={(payload.items ?? []) as ItineraryItem[]} kinds={payload.kinds} />
        <section className="card import-card">
          <h3 className="card-title">自分のスマホに保存</h3>
          <p className="muted small">
            {existing
              ? `保存してある「${existing.name}」の予定を、この旅程に入れ替えます。`
              : '旅行として保存すると、いつでも見返せます。参考にしたいときは、保存したあと自由に編集できます。'}
            あとで新しいリンクが届いたら、開いて保存し直すと最新の旅程になります。
          </p>
          <button type="button" className="btn btn-primary btn-block" onClick={save} disabled={busy}>
            {existing ? '入れ替えて保存' : '保存する'}
          </button>
        </section>
      </main>
    </div>
  );
}

function TripShareView({ payload }: { payload: TripPayload }) {
  const existing = useLiveQuery(async () => (await db.trips.get(payload.trip.id)) ?? null, [payload]);
  const myName = useLiveQuery(() => lastMyName());
  const [meId, setMeId] = useState<string>('');
  const [busy, setBusy] = useState(false);

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
    if (existing && !confirm(`このスマホには「${existing.name}」がもうあります。共有された内容で上書きしますか？\n（予算・手持ち現金・自分の個人の支出・持ち物はそのまま残ります）`)) return;
    setBusy(true);
    const id = await importShared(payload, me);
    showToast('取り込みました');
    navigate({ name: 'trip', tripId: id, tab: payload.kind === 'itinerary' ? 'itinerary' : 'settle' }, { replace: true });
  };

  return (
    <div className="screen">
      <header className="app-header">
        <button className="icon-btn" onClick={() => navigate({ name: 'list' })} aria-label="旅行一覧へ">‹</button>
        <div className="header-title">
          <h1>{trip.name}</h1>
          <div className="sub">
            共有された{payload.kind === 'itinerary' ? '旅程' : '割り勘'}（読むだけ）・{formatMd(isoDate(payload.sharedAt))}時点
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
            {existing
              ? `このスマホにある「${existing.name}」を上書きします（予算・手持ち現金・自分の個人の支出・持ち物は残ります）。`
              : '新しい旅行として保存します。'}
          </p>
          <button type="button" className="btn btn-primary btn-block" onClick={doImport} disabled={busy || !me}>
            {existing ? '上書きして取り込む' : '取り込む'}
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
                    {it.estimatedCost !== undefined && (
                      <span className="muted small">予想 {formatMoney(it.estimatedCost, it.estimatedCurrency ?? trip.currency)}（1人）</span>
                    )}
                    {it.reservationNo && <span className="muted small">予約番号 {it.reservationNo}</span>}
                    {it.url && (
                      <a className="item-place" href={it.url} target="_blank" rel="noopener noreferrer">
                        予約ページ ↗
                      </a>
                    )}
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
  payload: TripPayload;
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
