import { useState } from 'react';
import type { ItineraryItem, Trip } from '../db/types';
import { createItem, deleteItem, updateItem, type ItemInput } from '../db/itineraryRepo';
import { normalizeUrl, tripDays } from '../lib/itinerary';
import { formatMd } from '../lib/date';
import { parseYenInput } from '../lib/trips';
import { Sheet } from './Sheet';
import { showToast } from './Toast';

type Props = { trip: Trip; item?: ItineraryItem; defaultDate: string; onClose: () => void };

const opt = (s: string) => (s.trim() ? s.trim() : undefined);

/** 予定の追加・編集 */
export function ItemSheet({ trip, item, defaultDate, onClose }: Props) {
  const [date, setDate] = useState(item?.date ?? defaultDate);
  const [time, setTime] = useState(item?.time ?? '');
  const [title, setTitle] = useState(item?.title ?? '');
  const [place, setPlace] = useState(item?.place ?? '');
  const [cost, setCost] = useState(item?.estimatedCost !== undefined ? String(item.estimatedCost) : '');
  const [reservationNo, setReservationNo] = useState(item?.reservationNo ?? '');
  const [checkInTime, setCheckInTime] = useState(item?.checkInTime ?? '');
  const [url, setUrl] = useState(item?.url ?? '');
  const [memo, setMemo] = useState(item?.memo ?? '');
  const [showMore, setShowMore] = useState(Boolean(item?.reservationNo || item?.checkInTime || item?.url || item?.memo));
  const [error, setError] = useState('');

  const days = tripDays(trip);
  const dateOptions = days.map((d) => ({ value: d.date, label: `${d.label}  ${d.sub}` }));
  if (!days.some((d) => d.date === date)) dateOptions.push({ value: date, label: `日程外  ${formatMd(date)}` });

  const save = async () => {
    const costNum = parseYenInput(cost);
    if (!title.trim()) return setError('タイトルを入れてください');
    if (costNum !== undefined && Number.isNaN(costNum)) return setError('予想費用は数字（円）で入れてください');
    const input: ItemInput = {
      date,
      time: opt(time),
      title: title.trim(),
      place: opt(place),
      memo: opt(memo),
      estimatedCost: costNum,
      reservationNo: opt(reservationNo),
      checkInTime: opt(checkInTime),
      url: normalizeUrl(url),
    };
    if (item) await updateItem(item.id, input);
    else await createItem(trip.id, input);
    showToast(item ? '予定を保存しました' : '予定を追加しました');
    onClose();
  };

  const remove = async () => {
    if (!item || !confirm(`「${item.title}」を削除しますか？`)) return;
    await deleteItem(item.id);
    showToast('予定を削除しました');
    onClose();
  };

  return (
    <Sheet
      title={item ? '予定を編集' : '予定を追加'}
      onClose={onClose}
      action={
        <button type="button" className="btn btn-primary btn-small" onClick={save}>
          保存
        </button>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {error && (
          <p className="errors" role="alert">
            {error}
          </p>
        )}
        <div className="field-row">
          <label className="field">
            <span className="label">日付</span>
            <select value={date} onChange={(e) => setDate(e.target.value)}>
              {dateOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">時刻</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span className="label">タイトル</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：清水寺" autoFocus={!item} />
        </label>
        <label className="field">
          <span className="label">場所（Google マップで検索します）</span>
          <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="例：清水寺 京都" />
        </label>
        <label className="field">
          <span className="label">予想費用（円）</span>
          <input inputMode="numeric" pattern="[0-9]*" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="例：500" />
        </label>

        {showMore ? (
          <>
            <div className="field-row">
              <label className="field">
                <span className="label">予約番号</span>
                <input value={reservationNo} onChange={(e) => setReservationNo(e.target.value)} autoCapitalize="characters" />
              </label>
              <label className="field">
                <span className="label">チェックイン</span>
                <input type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} />
              </label>
            </div>
            <label className="field">
              <span className="label">予約ページの URL</span>
              <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
            </label>
            <label className="field">
              <span className="label">メモ</span>
              <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} />
            </label>
          </>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={() => setShowMore(true)}>
            ＋予約情報・メモ
          </button>
        )}

        {item && (
          <button type="button" className="btn btn-danger-outline btn-block" onClick={remove}>
            この予定を削除
          </button>
        )}
      </form>
    </Sheet>
  );
}
