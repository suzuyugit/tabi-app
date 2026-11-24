import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import type { ItineraryItem, Trip } from '../../db/types';
import { deleteItem, reorderItems } from '../../db/itineraryRepo';
import { byOrder, continuesOn, insertIndex, itemIcon, itemKey, kindMeta, mapsUrl, routeUrl, tripDays } from '../../lib/itinerary';
import { dayShiftLabel, hasTimeDiff, localMinutes, nowWall, otherZoneTime } from '../../lib/timezone';
import { formatMd } from '../../lib/date';
import { convert, formatMoney, JPY, tripCurrency } from '../../lib/currency';
import { expenseCurrency } from '../../lib/money';
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
    // 旅行中は今日（現地の日付）のタブを最初に開く
    const today = nowWall(trip).date;
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
    // 実際に使った額は現地通貨にそろえる（予想費用と比べるため）
    const local = tripCurrency(trip);
    for (const e of expenses) {
      if (e.itemId) actual.set(e.itemId, (actual.get(e.itemId) ?? 0) + convert(e.amount, expenseCurrency(e), local, trip));
    }
    return { items, actual };
  }, [trip]);

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
  const today = nowWall(trip).date;
  const tzDiff = hasTimeDiff(trip);

  // 日をまたぐ移動は、到着する日（と途中の日）にも出す。並び替えの対象にはしない
  type Row = { kind: 'item'; item: ItineraryItem; index: number } | { kind: 'cont'; item: ItineraryItem };
  const rows: Row[] = list.map((item, index) => ({ kind: 'item', item, index }));
  if (current !== OUTSIDE) {
    const keys = list.map((it) => itemKey(trip, it));
    const conts = (data?.items ?? [])
      .filter((it) => continuesOn(it, current))
      .map((it) => {
        const onArrivalDay = it.arrivalDate === current && it.arrivalTime;
        const key = onArrivalDay ? localMinutes(trip, current, it.arrivalDate!, it.arrivalTime!, it.arrivalIn) : -Infinity;
        return { it, at: key === -Infinity ? 0 : insertIndex(keys, key), key };
      })
      .sort((a, b) => b.at - a.at || b.key - a.key);
    // 後ろから差し込むと位置がずれない
    for (const c of conts) rows.splice(c.at, 0, { kind: 'cont', item: c.it });
  }

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
              {d.date === today && ' 今日'}
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

      {data && rows.length === 0 && <p className="empty">この日の予定はまだありません。</p>}
      {tzDiff && rows.length > 0 && <p className="hint tz-note">時刻は「現地」「日本」の印がついた時間です</p>}

      <ul className="item-list">
        {rows.map((row) =>
          row.kind === 'item' ? (
            <li
              key={row.item.id}
              {...bind(row.item.id)}
              style={styleFor(row.index)}
              className={`item-card ${draggingId === row.item.id ? 'dragging' : ''}`}
              onClick={() => setEditing({ item: row.item })}
            >
              <ItemCardBody
                item={row.item}
                trip={trip}
                tzDiff={tzDiff}
                currency={tripCurrency(trip)}
                actual={data?.actual.get(row.item.id)}
                showDate={current === OUTSIDE}
                onMenu={() => setMenuFor(row.item)}
              />
            </li>
          ) : (
            <li key={`cont-${row.item.id}`} className="item-card item-cont" onClick={() => setEditing({ item: row.item })}>
              <ContinuationBody item={row.item} day={current} tzDiff={tzDiff} />
            </li>
          ),
        )}
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

type CardProps = {
  item: ItineraryItem;
  trip: Trip;
  tzDiff: boolean;
  currency: string;
  actual?: number;
  showDate: boolean;
  onMenu: () => void;
};

/** 時刻の横の「現地」「日本」の印 */
function ZoneBadge({ side }: { side: 'local' | 'japan' | undefined }) {
  return <span className={`tz-badge ${side === 'japan' ? 'jp' : ''}`}>{side === 'japan' ? '日本' : '現地'}</span>;
}

/** もう片方の時間帯での時刻。例：「日本時間 05:00（翌日）」 */
function otherText(trip: Trip, date: string, time: string, side: 'local' | 'japan' | undefined): string {
  const o = otherZoneTime(trip, date, time, side);
  return `${o.label} ${o.time}${o.shift ? `（${o.shift}）` : ''}`;
}

function ItemCardBody({ item, trip, tzDiff, currency, actual, showDate, onMenu }: CardProps) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  // 予想費用は円で入れていることもあるので、現地通貨にそろえて比べる
  const estLocal =
    item.estimatedCost !== undefined ? convert(item.estimatedCost, item.estimatedCurrency ?? currency, currency, trip) : undefined;
  const over = actual !== undefined && estLocal !== undefined && actual > estLocal;
  const foreign = currency !== JPY;
  /** 海外では「$20（≈3,000円）」のように両方の通貨で出す */
  const both = (minor: number, cur: string) => {
    const other = cur === JPY ? currency : JPY;
    return foreign ? `${formatMoney(minor, cur)}（≈${formatMoney(convert(minor, cur, other, trip), other)}）` : formatMoney(minor, cur);
  };

  return (
    <>
      <div className="item-time">
        {showDate && <span className="item-date">{formatMd(item.date)}</span>}
        {item.time ?? <span className="item-undecided">未定</span>}
        {tzDiff && item.time && <ZoneBadge side={item.timeIn} />}
        {item.kind === 'move' && item.arrivalTime && (
          <span className="item-arrive">
            〜{item.arrivalDate && item.arrivalDate !== item.date ? `${dayShiftLabel(item.date, item.arrivalDate)} ` : ''}
            {item.arrivalTime}
            {tzDiff && <ZoneBadge side={item.arrivalIn} />}
          </span>
        )}
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
        {tzDiff && (item.time || (item.kind === 'move' && item.arrivalTime)) && (
          <div className="item-tz">
            {item.time && <span>{otherText(trip, item.date, item.time, item.timeIn)}</span>}
            {item.kind === 'move' && item.arrivalTime && (
              <span>
                着 {otherText(trip, item.arrivalDate ?? item.date, item.arrivalTime, item.arrivalIn)}
              </span>
            )}
          </div>
        )}
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
            {item.estimatedCost !== undefined && (
              <span className="muted">予想 {both(item.estimatedCost, item.estimatedCurrency ?? currency)}</span>
            )}
            {actual !== undefined && <span className={over ? 'over' : ''}>実際 {both(actual, currency)}</span>}
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

/** 日をまたぐ移動の、到着日（と途中の日）に出すカード */
function ContinuationBody({ item, day, tzDiff }: { item: ItineraryItem; day: string; tzDiff: boolean }) {
  const arriving = item.arrivalDate === day;
  return (
    <>
      <div className="item-time">
        {arriving && item.arrivalTime ? (
          <>
            <span className="item-arrive-label">着</span>
            {item.arrivalTime}
            {tzDiff && <ZoneBadge side={item.arrivalIn} />}
          </>
        ) : (
          <span className="item-undecided">{arriving ? '到着' : '終日'}</span>
        )}
      </div>
      <div className="item-main">
        <div className="item-title-row">
          <span className="item-title">
            <span className="item-kind">{itemIcon(item)}</span>
            {item.title}
          </span>
        </div>
        <div className="item-cont-note">
          {formatMd(item.date)} {item.time ?? ''} 出発の続き{arriving ? '（この日に到着）' : '（移動中）'}
        </div>
        {(item.from || item.to) && (
          <div className="route-text">
            {item.from}
            <span className="route-sep">→</span>
            {item.to}
          </div>
        )}
      </div>
    </>
  );
}
