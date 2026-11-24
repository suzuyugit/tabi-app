import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import type { ItineraryItem, Trip } from '../../db/types';
import { deleteItem, reorderItems } from '../../db/itineraryRepo';
import { byOrder, itemIcon, kindMeta, mapsUrl, routeUrl, tripDays } from '../../lib/itinerary';
import { formatMd, formatYen, todayYmd } from '../../lib/date';
import { copyText } from '../../lib/clipboard';
import { useLongPressReorder } from '../../hooks/useLongPressReorder';
import { ItemSheet } from '../../components/ItemSheet';
import { DuplicateSheet } from '../../components/DuplicateSheet';
import { Sheet } from '../../components/Sheet';
import { showToast } from '../../components/Toast';

const OUTSIDE = 'outside';

type Props = { trip: Trip };

export function ItineraryTab({ trip }: Props) {
  const days = useMemo(() => tripDays(trip), [trip]);
  const [selected, setSelected] = useState(() => {
    // 旅行中は今日のタブを最初に開く
    const today = todayYmd();
    return days.some((d) => d.date === today) ? today : (days[0]?.date ?? OUTSIDE);
  });
  const [editing, setEditing] = useState<{ item?: ItineraryItem } | null>(null);
  const [menuFor, setMenuFor] = useState<ItineraryItem | null>(null);
  const [duplicating, setDuplicating] = useState<ItineraryItem | null>(null);

  const data = useLiveQuery(async () => {
    const [items, expenses] = await Promise.all([
      db.itineraryItems.where('tripId').equals(trip.id).toArray(),
      db.expenses.where('tripId').equals(trip.id).toArray(),
    ]);
    const actual = new Map<string, number>();
    for (const e of expenses) if (e.itemId) actual.set(e.itemId, (actual.get(e.itemId) ?? 0) + e.amount);
    return { items, actual };
  }, [trip.id]);

  const dayDates = new Set(days.map((d) => d.date));
  const outsideItems = (data?.items ?? []).filter((it) => !dayDates.has(it.date));
  // 旅行の日程を縮めたなどで、選んでいた日がなくなったとき
  const current = selected === OUTSIDE || dayDates.has(selected) ? selected : (days[0]?.date ?? OUTSIDE);

  const list = (data?.items ?? [])
    .filter((it) => (current === OUTSIDE ? !dayDates.has(it.date) : it.date === current))
    .sort((a, b) => (current === OUTSIDE ? a.date.localeCompare(b.date) || byOrder(a, b) : byOrder(a, b)));

  const { bind, styleFor, draggingId } = useLongPressReorder(
    list.map((it) => it.id),
    (ids) => reorderItems(ids),
  );

  const defaultDate = current === OUTSIDE ? (days[0]?.date ?? trip.startDate) : current;

  return (
    <>
      <nav className="day-tabs" aria-label="日付">
        {days.map((d) => (
          <button
            key={d.date}
            className={`day-tab ${d.date === current ? 'active' : ''}`}
            onClick={() => setSelected(d.date)}
            aria-current={d.date === current ? 'date' : undefined}
          >
            <span className="day-tab-label">{d.label}</span>
            <span className="day-tab-sub">
              {d.sub}
              {d.date === todayYmd() && ' 今日'}
            </span>
          </button>
        ))}
        {outsideItems.length > 0 && (
          <button className={`day-tab ${current === OUTSIDE ? 'active' : ''}`} onClick={() => setSelected(OUTSIDE)}>
            <span className="day-tab-label">日程外</span>
            <span className="day-tab-sub">{outsideItems.length}件</span>
          </button>
        )}
      </nav>

      {data && list.length === 0 && <p className="empty">この日の予定はまだありません。</p>}

      <ul className="item-list">
        {list.map((it, i) => (
          <li
            key={it.id}
            {...bind(it.id)}
            style={styleFor(i)}
            className={`item-card ${draggingId === it.id ? 'dragging' : ''}`}
            onClick={() => setEditing({ item: it })}
          >
            <ItemCardBody item={it} actual={data?.actual.get(it.id)} showDate={current === OUTSIDE} onMenu={() => setMenuFor(it)} />
          </li>
        ))}
      </ul>

      {list.length > 1 && <p className="hint center">長押しで並び替えできます</p>}

      <button className="btn btn-ghost btn-block" onClick={() => setEditing({})}>
        ＋予定を追加
      </button>

      {editing && (
        <ItemSheet trip={trip} item={editing.item} defaultDate={defaultDate} onClose={() => setEditing(null)} />
      )}
      {duplicating && <DuplicateSheet trip={trip} item={duplicating} onClose={() => setDuplicating(null)} />}
      {menuFor && (
        <Sheet title={menuFor.title} onClose={() => setMenuFor(null)}>
          <div className="menu-list">
            <button
              className="btn btn-ghost btn-block"
              onClick={() => {
                setEditing({ item: menuFor });
                setMenuFor(null);
              }}
            >
              編集
            </button>
            <button
              className="btn btn-ghost btn-block"
              onClick={() => {
                setDuplicating(menuFor);
                setMenuFor(null);
              }}
            >
              別の日に複製
            </button>
            <button
              className="btn btn-danger-outline btn-block"
              onClick={async () => {
                if (!confirm(`「${menuFor.title}」を削除しますか？`)) return;
                await deleteItem(menuFor.id);
                setMenuFor(null);
                showToast('予定を削除しました');
              }}
            >
              削除
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

type CardProps = { item: ItineraryItem; actual?: number; showDate: boolean; onMenu: () => void };

function ItemCardBody({ item, actual, showDate, onMenu }: CardProps) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const over = actual !== undefined && item.estimatedCost !== undefined && actual > item.estimatedCost;

  return (
    <>
      <div className="item-time">
        {showDate && <span className="item-date">{formatMd(item.date)}</span>}
        {item.time ?? '--:--'}
        {item.kind === 'move' && item.arrivalTime && <span className="item-arrive">〜{item.arrivalTime}</span>}
      </div>
      <div className="item-main">
        <div className="item-title-row">
          <span className="item-title">
            <span className="item-kind" title={kindMeta(item.kind).label}>
              {itemIcon(item)}
            </span>
            {item.title}
          </span>
          <button
            type="button"
            className="icon-btn item-menu"
            aria-label={`${item.title}のメニュー`}
            onClick={(e) => {
              stop(e);
              onMenu();
            }}
            onPointerDown={stop}
          >
            ⋯
          </button>
        </div>
        {item.kind === 'move' && (item.from || item.to) && (
          <div className="item-route">
            <span className="route-text">
              {item.from && <PlaceLink place={item.from} />}
              <span className="route-sep">→</span>
              {item.to && <PlaceLink place={item.to} />}
            </span>
            {item.from && item.to && (
              <a
                className="chip chip-btn"
                href={routeUrl(item.from, item.to, item.transport)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={stop}
              >
                経路 ↗
              </a>
            )}
          </div>
        )}
        {item.places?.map((pl, i) => (
          <a key={i} className="item-place" href={mapsUrl(pl)} target="_blank" rel="noopener noreferrer" onClick={stop}>
            📍 {pl}
          </a>
        ))}
        {(item.checkInTime || item.reservationNo || item.url) && (
          <div className="item-reserve">
            {item.checkInTime && <span className="chip">IN {item.checkInTime}</span>}
            {item.reservationNo && (
              <button
                type="button"
                className="chip chip-btn"
                onClick={async (e) => {
                  stop(e);
                  const ok = await copyText(item.reservationNo!);
                  showToast(ok ? '予約番号をコピーしました' : 'コピーできませんでした');
                }}
                onPointerDown={stop}
              >
                予約 {item.reservationNo} 📋
              </button>
            )}
            {item.url && (
              <a className="chip chip-btn" href={item.url} target="_blank" rel="noopener noreferrer" onClick={stop}>
                予約ページ ↗
              </a>
            )}
          </div>
        )}
        {(item.estimatedCost !== undefined || actual !== undefined) && (
          <div className="item-cost">
            {item.estimatedCost !== undefined && <span className="muted">予想 {formatYen(item.estimatedCost)}</span>}
            {actual !== undefined && <span className={over ? 'over' : ''}>実際 {formatYen(actual)}</span>}
          </div>
        )}
        {item.memo && <div className="item-memo">{item.memo}</div>}
      </div>
    </>
  );
}

function PlaceLink({ place }: { place: string }) {
  return (
    <a className="route-place" href={mapsUrl(place)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
      {place}
    </a>
  );
}
