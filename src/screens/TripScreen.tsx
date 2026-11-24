import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { formatRange } from '../lib/date';
import { navigate, type TabKey } from '../router';
import { ItineraryTab } from './tabs/ItineraryTab';

const TABS: { key: TabKey; label: string; icon: string; step: number }[] = [
  { key: 'itinerary', label: '旅程', icon: '🗓️', step: 2 },
  { key: 'money', label: 'お金', icon: '💴', step: 2 },
  { key: 'settle', label: '精算', icon: '🤝', step: 3 },
  { key: 'packing', label: '持ち物', icon: '🎒', step: 3 },
];

type Props = { tripId: string; tab: TabKey };

export function TripScreen({ tripId, tab }: Props) {
  // null = 見つからない / undefined = 読み込み中
  const trip = useLiveQuery(async () => (await db.trips.get(tripId)) ?? null, [tripId]);

  if (trip === undefined) return <div className="screen" />;
  if (trip === null) {
    return (
      <div className="screen">
        <header className="app-header">
          <button className="icon-btn" onClick={() => navigate({ name: 'list' })} aria-label="戻る">‹</button>
          <h1>旅行が見つかりません</h1>
        </header>
      </div>
    );
  }

  const current = TABS.find((t) => t.key === tab)!;

  return (
    <div className="screen has-tabbar">
      <header className="app-header">
        <button className="icon-btn" onClick={() => navigate({ name: 'list' })} aria-label="旅行一覧へ">‹</button>
        <div className="header-title">
          <h1>{trip.name}</h1>
          <div className="sub">{formatRange(trip.startDate, trip.endDate)}</div>
        </div>
        <button className="btn btn-ghost btn-small" onClick={() => navigate({ name: 'editTrip', tripId })}>
          編集
        </button>
      </header>

      <main className="content">
        {tab === 'itinerary' ? (
          <ItineraryTab trip={trip} />
        ) : (
          <div className="empty">
            <p>
              {current.icon} {current.label}タブ
            </p>
            <p className="muted">開発ステップ{current.step}で作ります。</p>
          </div>
        )}
      </main>

      <nav className="tabbar" aria-label="タブ">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab ${t.key === tab ? 'active' : ''}`}
            aria-current={t.key === tab ? 'page' : undefined}
            onClick={() => navigate({ name: 'trip', tripId, tab: t.key }, { replace: true })}
          >
            <span className="tab-icon">{t.icon}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
