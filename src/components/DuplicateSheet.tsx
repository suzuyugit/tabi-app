import { useState } from 'react';
import type { ItineraryItem, Trip } from '../db/types';
import { duplicateItem } from '../db/itineraryRepo';
import { tripDays } from '../lib/itinerary';
import { Sheet } from './Sheet';
import { showToast } from './Toast';

type Props = { trip: Trip; item: ItineraryItem; onClose: () => void };

/** 予定を別の日（複数可）にコピーする */
export function DuplicateSheet({ trip, item, onClose }: Props) {
  const days = tripDays(trip).filter((d) => d.date !== item.date);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (date: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

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
        <ul className="check-list">
          {days.map((d) => (
            <li key={d.date}>
              <label className="check-row">
                <input type="checkbox" checked={selected.has(d.date)} onChange={() => toggle(d.date)} />
                <span>
                  {d.label} <span className="muted">{d.sub}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
