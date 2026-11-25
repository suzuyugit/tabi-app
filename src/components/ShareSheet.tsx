import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Trip } from '../db/types';
import { buildListPayload, buildPayload, isPersonal, packingNames, type OthersOptions, type ShareKind } from '../lib/share';
import { ShareButtons } from './ShareButtons';
import { Sheet } from './Sheet';

type Props = { trip: Trip; onClose: () => void };

/** 旅程・割り勘を URL（長ければ JSON ファイル）で共有する */
export function ShareSheet({ trip, onClose }: Props) {
  const [kind, setKind] = useState<ShareKind>('itinerary');
  const [listName, setListName] = useState(`${trip.name}の持ち物`);
  // 旅程を見せる相手：一緒に行く人 / ほかの人（親・参考にしたい人）
  const [toOthers, setToOthers] = useState(false);
  const [others, setOthers] = useState<OthersOptions>({ reservations: false, costs: true, memos: true });
  // 一緒に行く人に旅程を送るとき、割り勘・持ち物もまとめて送る
  const [withSettle, setWithSettle] = useState(false);
  const [withPacking, setWithPacking] = useState(false);
  const data = useLiveQuery(async () => {
    const [items, kinds, expenses, categories, repayments, packing] = await Promise.all([
      db.itineraryItems.where('tripId').equals(trip.id).toArray(),
      db.itemKinds.toArray(),
      db.expenses.where('tripId').equals(trip.id).toArray(),
      db.categories.toArray(),
      db.repayments.where('tripId').equals(trip.id).toArray(),
      db.packingItems.where('tripId').equals(trip.id).toArray(),
    ]);
    return { items, kinds, expenses, categories, repayments, packing };
  }, [trip.id]);

  if (!data) return null;
  // 持ち物は旅行の情報を入れず、リストだけを送る
  const payload =
    kind === 'packing'
      ? buildListPayload(listName.trim() || `${trip.name}の持ち物`, packingNames(data.packing))
      : kind === 'itinerary' && toOthers
        ? buildPayload(kind, trip, data, undefined, others)
        : buildPayload(kind, trip, data, undefined, undefined, kind === 'itinerary' ? { settle: withSettle, packing: withPacking ? data.packing : undefined } : undefined);
  const fileBase = `${kind}${kind === 'itinerary' && toOthers ? '-view' : ''}-${trip.startDate.replace(/-/g, '')}`;
  const title = `${trip.name}の${{ itinerary: '旅程', settle: '割り勘', packing: '持ち物' }[kind]}`;
  const sharedCount = data.expenses.filter((e) => !isPersonal(e)).length;

  return (
    <Sheet title="共有" onClose={onClose}>
      <div className="form">
        <div className="seg" role="radiogroup" aria-label="共有するもの">
          {(['itinerary', 'settle', 'packing'] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>
              {{ itinerary: '🗓️ 旅程', settle: '🤝 割り勘', packing: '🎒 持ち物' }[k]}
            </button>
          ))}
        </div>

        {kind === 'packing' ? (
          <div className="card share-contents">
            <label className="field">
              <span className="label">リストの名前</span>
              <input value={listName} onChange={(e) => setListName(e.target.value)} aria-label="リストの名前" />
            </label>
            <div className="card-label">送るもの</div>
            <ul>
              <li>持ち物 {data.packing.length}個の名前</li>
            </ul>
            <div className="card-label">送らないもの</div>
            <p className="muted small">旅行の情報（旅行名・日程・メンバー）・チェックの状態・予算・予定・支出</p>
            <p className="muted small">受け取った人は、自分の好きな旅行の持ち物に入れたり、リストとして保存したりできます。</p>
          </div>
        ) : (
        <>
        {kind === 'itinerary' && (
          <div className="seg" role="radiogroup" aria-label="見せる相手">
            <button type="button" role="radio" aria-checked={!toOthers} className={!toOthers ? 'active' : ''} onClick={() => setToOthers(false)}>
              一緒に行く人に
            </button>
            <button type="button" role="radio" aria-checked={toOthers} className={toOthers ? 'active' : ''} onClick={() => setToOthers(true)}>
              ほかの人に見せる
            </button>
          </div>
        )}
        {kind === 'itinerary' && toOthers ? (
          <div className="card share-contents">
            <p className="muted small">親に予定を知らせたり、旅程を参考にしてもらったりするときに。受け取った人は読むだけで見られ、自分のスマホに保存もできます。</p>
            <div className="card-label">送るもの</div>
            <ul>
              <li>旅行名・日程・予定 {data.items.length}件</li>
            </ul>
            <div className="card-label">一緒に送るか選ぶ</div>
            {(
              [
                ['costs', '予想費用'],
                ['memos', 'メモ'],
                ['reservations', '予約番号・予約ページ'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="mini-check share-opt">
                <input type="checkbox" checked={others[key]} onChange={(e) => setOthers((o) => ({ ...o, [key]: e.target.checked }))} />
                {label}
              </label>
            ))}
            <div className="card-label">送らないもの</div>
            <p className="muted small">メンバーの名前・予算・支出・持ち物{others.reservations ? '' : '・予約番号・予約ページ'}</p>
          </div>
        ) : (
        <div className="card share-contents">
          <div className="card-label">送るもの</div>
          <ul>
            <li>旅行名・日程・メンバー（{trip.members.map((m) => m.name).join('・')}）</li>
            {kind === 'itinerary' ? (
              <>
                <li>予定 {data.items.length}件</li>
                {withSettle && <li>割り勘した支出 {sharedCount}件{data.repayments.length > 0 ? `・渡したお金の記録 ${data.repayments.length}件` : ''}</li>}
                {withPacking && <li>持ち物 {data.packing.length}個の名前（受け取った人の持ち物に、ないものだけ追加されます）</li>}
              </>
            ) : (
              <>
                <li>割り勘した支出 {sharedCount}件（精算表は受け取った側で計算）</li>
                {data.repayments.length > 0 && <li>渡したお金の記録 {data.repayments.length}件</li>}
              </>
            )}
          </ul>
          {kind === 'itinerary' && (
            <>
              <div className="card-label">一緒に送る</div>
              <label className="mini-check share-opt">
                <input type="checkbox" checked={withSettle} onChange={(e) => setWithSettle(e.target.checked)} />
                🤝 割り勘（{sharedCount}件）
              </label>
              <label className="mini-check share-opt">
                <input type="checkbox" checked={withPacking} onChange={(e) => setWithPacking(e.target.checked)} />
                🎒 持ち物（{data.packing.length}個）
              </label>
            </>
          )}
          <div className="card-label">送らないもの</div>
          <p className="muted small">
            予算・手持ち現金・個人の支出{kind === 'itinerary' && withPacking ? '・持ち物のチェックの状態' : '・持ち物'}
          </p>
        </div>
        )}
        </>
        )}

        <ShareButtons payload={payload} title={title} fileBase={fileBase} />
      </div>
    </Sheet>
  );
}
