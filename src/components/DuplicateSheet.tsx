import { useState } from 'react';
import type { ItineraryItem, Trip } from '../db/types';
import { duplicateItem } from '../db/itineraryRepo';
import { tripDays } from '../lib/itinerary';
import { Sheet } from './Sheet';
import { useDayPlaces } from '../hooks/useDayPlaces';
import { showToast } from './Toast';

type Props = { trip: Trip; item: ItineraryItem; onClose: () => void };

/** 予定を別の日（複数可）にコピーする */
export function DuplicateSheet({ trip, item, onClose }: Props) {
  const days = tripDays(trip).filter((d) => d.date !== item.date);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const places = useDayPlaces(trip);

  const toggle = (date: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  const allSelected = days.length > 0 && days.every((d) => selected.has(d.date));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(days.map((d) => d.date)));

  const save = async () => {
    await duplicateItem(item.id, [...selected]);
    showToast(`${selected.size}日分にコピーしました`);
    onClose();
  };

  return (
    <Sheet
      title="予定を複製"
      onClose={onClose}
      action={
        <button type="button" className="btn btn-primary btn-small" onClick={save} disabled={selected.size === 0}>
          コピー
        </button>
      }
    >
      <p className="muted">
        「{item.time ? `${item.time} ` : ''}
        {item.title}」をコピーする日を選んでください。
      </p>
      {days.length === 0 ? (
        <p className="muted">ほかの日がありません。</p>
      ) : (
        <>
        <button type="button" className="btn btn-ghost btn-block select-all" onClick={toggleAll} aria-pressed={allSelected}>
          {allSelected ? 'すべての選択を外す' : `ほかの日すべて（${days.length}日）を選ぶ`}
        </button>
        <ul className="check-list">
          {days.map((d) => (
            <li key={d.date}>
              <label className="check-row">
                <input type="checkbox" checked={selected.has(d.date)} onChange={() => toggle(d.date)} />
                <span>
                  {d.label} <span className="muted">{d.sub}</span>
                  {places.get(d.date) && <span className="place-tag">📍{places.get(d.date)}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
        </>
      )}
    </Sheet>
  );
}
