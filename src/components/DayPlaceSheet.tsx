import { useState } from 'react';
import { db } from '../db/db';
import type { Trip } from '../db/types';
import { formatMd } from '../lib/date';
import { Sheet } from './Sheet';

/** その日いる場所を自分で決める（空にすると旅程から自動で決める） */
export function DayPlaceSheet({ trip, date, auto, onClose }: { trip: Trip; date: string; auto?: string; onClose: () => void }) {
  const [value, setValue] = useState(trip.dayPlaces?.[date] ?? '');
  const save = async (v: string) => {
    const next = { ...(trip.dayPlaces ?? {}) };
    if (v.trim()) next[date] = v.trim();
    else delete next[date];
    await db.trips.update(trip.id, { dayPlaces: next });
    onClose();
  };
  return (
    <Sheet
      title={`${formatMd(date)} の場所`}
      onClose={onClose}
      action={
        <button type="button" className="btn btn-primary btn-small" onClick={() => save(value)}>
          保存
        </button>
      }
    >
      <div className="form">
        <label className="field">
          <span className="label">この日いる場所（日付を選ぶところに出ます）</span>
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={auto ?? '例：札幌'} autoFocus />
        </label>
        <p className="muted small">
          空のままだと、旅程から自動で決めます（その日の夜の宿 → その日に着いた場所 → 前の日の場所）。
          {auto ? `今は「${auto}」になります。` : '今は旅程から決められる場所がありません。'}
        </p>
        <p className="muted small">次の日からも、場所が決まっていなければこの場所が続きます。</p>
        {trip.dayPlaces?.[date] && (
          <button type="button" className="btn btn-ghost btn-block" onClick={() => save('')}>
            自動（旅程から）に戻す
          </button>
        )}
      </div>
    </Sheet>
  );
}
