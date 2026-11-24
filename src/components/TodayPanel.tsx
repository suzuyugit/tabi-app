import { useState } from 'react';
import type { ItineraryItem, Trip } from '../db/types';
import { shiftItems } from '../db/itineraryRepo';
import { upcomingItems } from '../lib/itinerary';
import { hmToMinutes, formatDuration } from '../lib/datetime';
import { nowWall } from '../lib/timezone';
import { useNow } from '../hooks/useNow';
import { Sheet } from './Sheet';
import { showToast } from './Toast';

type Props = { trip: Trip; dayItems: ItineraryItem[] };

/** 当日モード：次の予定まであと何分か、と「以降を○分ずらす」 */
export function TodayPanel({ trip, dayItems }: Props) {
  const nowMs = useNow();
  const [shifting, setShifting] = useState(false);
  const now = nowWall(trip, nowMs);
  const nowMin = hmToMinutes(now.time);

  // 今より後の予定（時刻のあるもの）。時刻は現地時間に直して比べる
  const upcoming = upcomingItems(trip, dayItems, nowMin);
  const next = upcoming[0];

  return (
    <section className="today-panel" aria-label="当日モード">
      <div className="today-now">
        <span className="today-badge">今日</span>
        <span className="muted small">いま {now.time}</span>
      </div>
      {next ? (
        <div className="today-next">
          <span className="today-label">次は</span>
          <span className="today-title">
            {next.it.time} {next.it.title}
          </span>
          <span className="today-left">
            {next.key - nowMin === 0 ? 'まもなく' : `あと ${formatDuration(next.key - nowMin)}`}
          </span>
        </div>
      ) : (
        <div className="today-next muted">今日のこのあとの予定はありません</div>
      )}
      {upcoming.length > 0 && (
        <button type="button" className="btn btn-ghost btn-small" onClick={() => setShifting(true)}>
          ⏱ 以降の予定（{upcoming.length}件）をずらす
        </button>
      )}
      {shifting && (
        <ShiftSheet
          count={upcoming.length}
          firstTitle={next ? `${next.it.time} ${next.it.title}` : ''}
          onClose={() => setShifting(false)}
          onShift={async (delta) => {
            const r = await shiftItems(
              upcoming.map((u) => u.it.id),
              delta,
            );
            showToast(
              `${r.shifted}件を${delta > 0 ? `${formatDuration(delta)}後ろ` : `${formatDuration(-delta)}前`}にずらしました${r.clamped ? '（0:00〜23:59 で止めたものあり）' : ''}`,
            );
            setShifting(false);
          }}
        />
      )}
    </section>
  );
}

function ShiftSheet({
  count,
  firstTitle,
  onClose,
  onShift,
}: {
  count: number;
  firstTitle: string;
  onClose: () => void;
  onShift: (delta: number) => void;
}) {
  const [custom, setCustom] = useState('');
  const [sign, setSign] = useState<1 | -1>(1);
  const n = Number(custom);
  return (
    <Sheet title="以降の予定をずらす" onClose={onClose}>
      <div className="form">
        <p className="muted">
          「{firstTitle}」から後の、今日の予定 {count}件 の時刻をまとめてずらします。明日以降の予定は変わりません。
        </p>
        <div className="shift-grid">
          {[-30, -15, 10, 15, 30, 60].map((d) => (
            <button key={d} type="button" className="btn btn-ghost" onClick={() => onShift(d)}>
              {d > 0 ? '＋' : '−'}
              {formatDuration(Math.abs(d))}
            </button>
          ))}
        </div>
        <div className="shift-custom">
          <div className="seg seg-small" role="radiogroup" aria-label="向き">
            <button type="button" role="radio" aria-checked={sign === 1} className={sign === 1 ? 'active' : ''} onClick={() => setSign(1)}>
              遅らせる
            </button>
            <button type="button" role="radio" aria-checked={sign === -1} className={sign === -1 ? 'active' : ''} onClick={() => setSign(-1)}>
              早める
            </button>
          </div>
          <input inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="分" aria-label="ずらす分" />
          <span>分</span>
          <button
            type="button"
            className="btn btn-primary btn-small"
            disabled={!Number.isInteger(n) || n <= 0}
            onClick={() => onShift(sign * n)}
          >
            ずらす
          </button>
        </div>
      </div>
    </Sheet>
  );
}
