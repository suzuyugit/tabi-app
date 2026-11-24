import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { navigate } from '../router';
import { formatRange, formatYen } from '../lib/date';
import { sortTrips, tripStatus, type TripStatus } from '../lib/trips';
import { myTotal } from '../lib/money';

const STATUS_LABEL: Record<TripStatus, string> = { ongoing: '旅行中', upcoming: 'これから', past: '終わった旅行' };

export function TripListScreen() {
  const data = useLiveQuery(async () => {
    const [trips, expenses] = await Promise.all([db.trips.toArray(), db.expenses.toArray()]);
    // 予算は自分の分なので、カードにも自分の負担分を出す
    const spent = new Map<string, number>();
    for (const t of trips) spent.set(t.id, myTotal(t, expenses.filter((e) => e.tripId === t.id)));
    return { trips: sortTrips(trips), spent };
  });

  return (
    <div className="screen">
      <header className="app-header">
        <h1>旅行一覧</h1>
      </header>

      <main className="content">
        {data === undefined ? null : data.trips.length === 0 ? (
          <div className="empty">
            <p>まだ旅行がありません。</p>
            <p>下の「＋新しい旅行」から作りましょう。</p>
          </div>
        ) : (
          <ul className="trip-list">
            {data.trips.map((t) => {
              const status = tripStatus(t);
              const used = data.spent.get(t.id) ?? 0;
              const ratio = t.budget > 0 ? Math.min(used / t.budget, 1) : 0;
              const over = t.budget > 0 && used > t.budget;
              return (
                <li key={t.id}>
                  <button
                    className={`trip-card status-${status}`}
                    onClick={() => navigate({ name: 'trip', tripId: t.id, tab: 'itinerary' })}
                  >
                    <div className="trip-card-top">
                      <span className="trip-name">{t.name}</span>
                      <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>
                    </div>
                    <div className="trip-dates">{formatRange(t.startDate, t.endDate)}</div>
                    <div className="trip-members">{t.members.map((m) => m.name).join('・')}</div>
                    <div className="trip-money">
                      <span className="muted small">自分 </span>
                      <span className={over ? 'over' : ''}>{formatYen(used)}</span>
                      <span className="muted"> / {t.budget > 0 ? formatYen(t.budget) : '予算なし'}</span>
                    </div>
                    {t.budget > 0 && (
                      <div className="bar">
                        <div className={`bar-fill ${over ? 'over' : ''}`} style={{ width: `${ratio * 100}%` }} />
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <footer className="bottom-action">
        <button className="btn btn-primary btn-block" onClick={() => navigate({ name: 'newTrip' })}>
          ＋新しい旅行
        </button>
      </footer>
    </div>
  );
}
