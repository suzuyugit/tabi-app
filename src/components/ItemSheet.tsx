import { useState } from 'react';
import type { ItemKind, ItineraryItem, Transport, Trip } from '../db/types';
import { createItem, deleteItem, updateItem, type ItemInput } from '../db/itineraryRepo';
import { addDays, daysBetween, fallbackTitle, ITEM_KINDS, normalizeUrl, TRANSPORTS, tripDays } from '../lib/itinerary';
import { hasTimeDiff, otherZoneTime, wallToMs, zoneOf, type ZoneSide } from '../lib/timezone';
import { formatMd } from '../lib/date';
import { parseMoneyInput, toInputValue, tripCurrency } from '../lib/currency';
import { MoneyField } from './MoneyField';
import { Sheet } from './Sheet';
import { showToast } from './Toast';

type Props = { trip: Trip; item?: ItineraryItem; defaultDate: string; onClose: () => void };

const opt = (s: string) => (s.trim() ? s.trim() : undefined);

const TITLE_PLACEHOLDER: Record<ItemKind, string> = {
  move: '例：JAL 501便（空なら「飛行機」など）',
  food: '例：にしんそば',
  sightseeing: '例：清水寺',
  stay: '例：ホテル〇〇',
  shopping: '例：錦市場',
  other: '例：集合',
};

/** 予定の追加・編集 */
export function ItemSheet({ trip, item, defaultDate, onClose }: Props) {
  const [kind, setKind] = useState<ItemKind>(item?.kind ?? 'other');
  const [transport, setTransport] = useState<Transport>(item?.transport ?? 'train');
  const [date, setDate] = useState(item?.date ?? defaultDate);
  // 前に「チェックイン」欄だけ入れていた宿泊は、その時刻をチェックイン（時刻）として使う
  const legacyCheckIn = item?.kind === 'stay' && !item.time ? item.checkInTime : undefined;
  const [time, setTime] = useState(item?.time ?? legacyCheckIn ?? '');
  // 編集で時刻が入っていない予定は「未定」として開く
  const [undecided, setUndecided] = useState(item !== undefined && !item.time && !legacyCheckIn);
  const [nights, setNights] = useState(item?.checkOutDate ? Math.max(1, daysBetween(item.date, item.checkOutDate)) : 1);
  const [checkOutTime, setCheckOutTime] = useState(item?.checkOutTime ?? '');
  const [arrivalTime, setArrivalTime] = useState(item?.arrivalTime ?? '');
  // 到着日は「出発日から何日後か」で持つ（出発日を変えても一緒に動くように）
  const [arrivalOffset, setArrivalOffset] = useState(item?.arrivalDate ? daysBetween(item.date, item.arrivalDate) : 0);
  const tzDiff = hasTimeDiff(trip);
  const [timeIn, setTimeIn] = useState<ZoneSide>(item?.timeIn ?? 'local');
  const [arrivalIn, setArrivalIn] = useState<ZoneSide>(item?.arrivalIn ?? 'local');
  const [from, setFrom] = useState(item?.from ?? '');
  const [to, setTo] = useState(item?.to ?? '');
  // 移動でタイトルが自動の名前（「飛行機」など）のときは空欄から始める
  const [title, setTitle] = useState(item && !(item.kind === 'move' && item.title === fallbackTitle(item)) ? item.title : '');
  const [places, setPlaces] = useState<string[]>(item?.places?.length ? item.places : ['']);
  const local = tripCurrency(trip);
  const [costCurrency, setCostCurrency] = useState(item?.estimatedCurrency ?? local);
  const [cost, setCost] = useState(toInputValue(item?.estimatedCost, item?.estimatedCurrency ?? local));
  const [reservationNo, setReservationNo] = useState(item?.reservationNo ?? '');
  const [checkInTime, setCheckInTime] = useState(item?.checkInTime ?? '');
  const [url, setUrl] = useState(item?.url ?? '');
  const [memo, setMemo] = useState(item?.memo ?? '');
  const [showMore, setShowMore] = useState(
    Boolean(item?.reservationNo || (item?.kind !== 'stay' && item?.checkInTime) || item?.url || item?.memo),
  );
  const [error, setError] = useState('');

  const isMove = kind === 'move';
  const isStay = kind === 'stay';
  const timeLabel = isMove ? '出発時刻' : isStay ? 'チェックイン' : '時刻';
  const days = tripDays(trip);
  const dateOptions = days.map((d) => ({ value: d.date, label: `${d.label}  ${d.sub}` }));
  if (!days.some((d) => d.date === date)) dateOptions.push({ value: date, label: `日程外  ${formatMd(date)}` });

  const setPlaceAt = (i: number, v: string) => setPlaces((ps) => ps.map((p, j) => (j === i ? v : p)));
  const addPlace = () => setPlaces((ps) => [...ps, '']);
  const removePlace = (i: number) => setPlaces((ps) => (ps.length === 1 ? [''] : ps.filter((_, j) => j !== i)));

  const save = async () => {
    const costNum = parseMoneyInput(cost, costCurrency);
    const move = isMove
      ? {
          transport,
          from: opt(from),
          to: opt(to),
          arrivalTime: opt(arrivalTime),
          arrivalDate: arrivalOffset !== 0 ? addDays(date, arrivalOffset) : undefined,
          arrivalIn: tzDiff ? arrivalIn : undefined,
        }
      : {};
    const finalTitle = title.trim() || (isMove ? fallbackTitle({ kind, transport }) : '');
    if (!finalTitle) return setError('タイトルを入れてください');
    if (costNum !== undefined && Number.isNaN(costNum)) return setError('予想費用を正しく入れてください');
    const input: ItemInput = {
      kind,
      date,
      time: undecided ? undefined : opt(time),
      timeIn: tzDiff && !undecided && time ? timeIn : undefined,
      title: finalTitle,
      places: places.map((p) => p.trim()).filter(Boolean),
      ...move,
      memo: opt(memo),
      estimatedCost: costNum,
      estimatedCurrency: costNum !== undefined && costCurrency !== local ? costCurrency : undefined,
      reservationNo: opt(reservationNo),
      // 宿泊はチェックインを「時刻」で持つので、別の欄は使わない
      checkInTime: isStay ? undefined : opt(checkInTime),
      checkOutDate: isStay ? addDays(date, nights) : undefined,
      checkOutTime: isStay ? opt(checkOutTime) : undefined,
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

        <div className="field">
          <span className="label">種類</span>
          <div className="kind-grid" role="radiogroup" aria-label="種類">
            {ITEM_KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                role="radio"
                aria-checked={k.key === kind}
                className={`kind-btn ${k.key === kind ? 'active' : ''}`}
                onClick={() => setKind(k.key)}
              >
                <span className="kind-icon">{k.icon}</span>
                {k.label}
              </button>
            ))}
          </div>
        </div>

        {isMove && (
          <div className="field">
            <span className="label">移動手段</span>
            <div className="chips" role="radiogroup" aria-label="移動手段">
              {TRANSPORTS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="radio"
                  aria-checked={t.key === transport}
                  className={`pick ${t.key === transport ? 'active' : ''}`}
                  onClick={() => setTransport(t.key)}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>
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
          <div className="field">
            <div className="label-row">
              <span className="label">{timeLabel}</span>
              <label className="mini-check">
                <input type="checkbox" checked={undecided} onChange={(e) => setUndecided(e.target.checked)} />
                未定
              </label>
            </div>
            {undecided ? (
              <div className="time-undecided">未定</div>
            ) : (
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label={timeLabel} />
            )}
            {tzDiff && !undecided && <ZoneToggle value={timeIn} onChange={setTimeIn} label={timeLabel} />}
            {tzDiff && !undecided && time && <OtherZone text={otherZoneTime(trip, date, time, timeIn)} />}
          </div>
        </div>

        {isStay && (
          <div className="route-fields">
            <label className="field">
              <span className="label">泊数</span>
              <select value={nights} onChange={(e) => setNights(Number(e.target.value))} aria-label="泊数">
                {Array.from({ length: 14 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}泊（{formatMd(addDays(date, n))}まで）
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">チェックアウト</span>
              <input type="time" value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)} aria-label="チェックアウト" />
            </label>
            <span className="hint">
              {formatMd(date)} チェックイン → {formatMd(addDays(date, nights))} チェックアウト
              {tzDiff ? '（現地時間）' : ''}
            </span>
          </div>
        )}

        {isMove && (
          <div className="route-fields">
            <label className="field">
              <span className="label">出発地</span>
              <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="例：羽田空港" />
            </label>
            <div className="route-arrow" aria-hidden="true">
              ↓
            </div>
            <label className="field">
              <span className="label">到着地</span>
              <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="例：新千歳空港" />
            </label>
            <div className="field-row route-to">
              <label className="field">
                <span className="label">到着日</span>
                <select value={arrivalOffset} onChange={(e) => setArrivalOffset(Number(e.target.value))} aria-label="到着日">
                  {[-1, 0, 1, 2].map((n) => (
                    <option key={n} value={n}>
                      {['前日', '当日', '翌日', '2日後'][n + 1]} {formatMd(addDays(date, n))}
                    </option>
                  ))}
                </select>
              </label>
              <div className="field">
                <span className="label">到着時刻</span>
                <input type="time" value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)} aria-label="到着時刻" />
              </div>
            </div>
            {tzDiff && <ZoneToggle value={arrivalIn} onChange={setArrivalIn} label="到着時刻" />}
            {tzDiff && arrivalTime && (
              <OtherZone text={otherZoneTime(trip, addDays(date, arrivalOffset), arrivalTime, arrivalIn)} />
            )}
            {(() => {
              // 到着が出発より前になっていたら知らせる（日付や時差の入れ間違いに気づけるように）
              if (undecided || !time || !arrivalTime) return null;
              const dep = wallToMs(date, time, zoneOf(trip, tzDiff ? timeIn : 'local'));
              const arr = wallToMs(addDays(date, arrivalOffset), arrivalTime, zoneOf(trip, tzDiff ? arrivalIn : 'local'));
              if (arr >= dep) {
                const mins = Math.round((arr - dep) / 60000);
                return <span className="hint">所要 {Math.floor(mins / 60)}時間{mins % 60 ? `${mins % 60}分` : ''}</span>;
              }
              return <span className="hint over">到着が出発より前になっています。到着日や時差を確認してください</span>;
            })()}
          </div>
        )}

        <label className="field">
          <span className="label">{isMove ? '便名・メモ（任意）' : 'タイトル'}</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={TITLE_PLACEHOLDER[kind]}
          />
        </label>

        <div className="field">
          <span className="label">{isMove ? '経由地・ほかの場所' : '場所'}（Google マップで検索します）</span>
          <ul className="place-list">
            {places.map((p, i) => (
              <li key={i} className="member-row">
                <input
                  value={p}
                  onChange={(e) => setPlaceAt(i, e.target.value)}
                  placeholder={i === 0 ? '例：清水寺 京都' : `場所 ${i + 1}`}
                  aria-label={`場所 ${i + 1}`}
                />
                {(places.length > 1 || p) && (
                  <button type="button" className="icon-btn danger" onClick={() => removePlace(i)} aria-label={`場所 ${i + 1} を消す`}>
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-ghost btn-small" onClick={addPlace}>
            ＋場所を追加
          </button>
        </div>

        <MoneyField
          trip={trip}
          label="予想費用（1人あたり）"
          value={cost}
          currency={costCurrency}
          onChange={setCost}
          onCurrencyChange={setCostCurrency}
          placeholder="例：500"
        />

        {showMore ? (
          <>
            <div className="field-row">
              <label className="field">
                <span className="label">予約番号</span>
                <input value={reservationNo} onChange={(e) => setReservationNo(e.target.value)} autoCapitalize="characters" />
              </label>
              {!isStay && (
                <label className="field">
                  <span className="label">チェックイン</span>
                  <input type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} />
                </label>
              )}
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

/** 時刻が現地時間か日本時間かの切り替え */
function ZoneToggle({ value, onChange, label }: { value: ZoneSide; onChange: (v: ZoneSide) => void; label: string }) {
  return (
    <div className="seg seg-small zone-toggle" role="radiogroup" aria-label={`${label}の時間帯`}>
      {(['local', 'japan'] as const).map((z) => (
        <button key={z} type="button" role="radio" aria-checked={value === z} className={value === z ? 'active' : ''} onClick={() => onChange(z)}>
          {z === 'local' ? '現地時間' : '日本時間'}
        </button>
      ))}
    </div>
  );
}

function OtherZone({ text }: { text: { label: string; time: string; shift: string } }) {
  return (
    <span className="hint">
      ＝ {text.label}時間 {text.time}
      {text.shift && `（${text.shift}）`}
    </span>
  );
}
