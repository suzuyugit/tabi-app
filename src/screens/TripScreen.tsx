import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Expense } from '../db/types';
import { formatRange } from '../lib/date';
import { navigate, type TabKey } from '../router';
import { ItineraryTab } from './tabs/ItineraryTab';
import { MoneyTab } from './tabs/MoneyTab';
import { SettleTab } from './tabs/SettleTab';
import { PackingTab } from './tabs/PackingTab';
import { ExpenseSheet } from '../components/ExpenseSheet';
import { ShareSheet } from '../components/ShareSheet';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'itinerary', label: '旅程', icon: '🗓️' },
  { key: 'money', label: 'お金', icon: '💴' },
  { key: 'settle', label: '精算', icon: '🤝' },
  { key: 'packing', label: '持ち物', icon: '🎒' },
];

type Props = { tripId: string; tab: TabKey };

export function TripScreen({ tripId, tab }: Props) {
  // null = 見つからない / undefined = 読み込み中
  const trip = useLiveQuery(async () => (await db.trips.get(tripId)) ?? null, [tripId]);
  const [expenseSheet, setExpenseSheet] = useState<{ expense?: Expense } | null>(null);
  const [sharing, setSharing] = useState(false);
  // iPhone はタップの処理の中でフォーカスしないとキーボードが出ない。
  // ＋ボタンを押した瞬間にこの見えない入力欄へフォーカスしてキーボードを出し、
  // シートが開いたら金額欄へフォーカスを移す。
  const keyboardProxy = useRef<HTMLInputElement>(null);

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

  return (
    <div className="screen has-tabbar">
      <header className="app-header">
        <button className="icon-btn" onClick={() => navigate({ name: 'list' })} aria-label="旅行一覧へ">‹</button>
        <div className="header-title">
          <h1>{trip.name}</h1>
          <div className="sub">{formatRange(trip.startDate, trip.endDate)}</div>
        </div>
        <button className="btn btn-ghost btn-small" onClick={() => setSharing(true)} aria-label="共有">
          ↗ 共有
        </button>
        <button className="btn btn-ghost btn-small" onClick={() => navigate({ name: 'editTrip', tripId })}>
          編集
        </button>
      </header>

      <main className="content">
        {tab === 'itinerary' ? (
          <ItineraryTab trip={trip} />
        ) : tab === 'money' ? (
          <MoneyTab trip={trip} onEdit={(expense) => setExpenseSheet({ expense })} />
        ) : tab === 'settle' ? (
          <SettleTab trip={trip} />
        ) : (
          <PackingTab trip={trip} />
        )}
      </main>

      <input ref={keyboardProxy} className="keyboard-proxy" inputMode="numeric" tabIndex={-1} aria-hidden="true" />
      <button
        className="fab"
        aria-label="支出を記録"
        onClick={() => {
          // ページを動かさずにフォーカスする（iPhone で画面がずれないように）
          keyboardProxy.current?.focus({ preventScroll: true });
          setExpenseSheet({});
        }}
      >
        ＋
      </button>

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

      {sharing && <ShareSheet trip={trip} onClose={() => setSharing(false)} />}
      {expenseSheet && (
        <ExpenseSheet trip={trip} expense={expenseSheet.expense} onClose={() => setExpenseSheet(null)} />
      )}
    </div>
  );
}
