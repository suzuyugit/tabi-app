import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { addListItem, countMissingPacking, putPackingNames, removeListItem, reorderListItems, toggleListItem, uncheckList } from '../db/packingRepo';
import { EditListSheet, PutButtons } from '../components/PackingListSheets';
import { ShareButtons } from '../components/ShareButtons';
import { Sheet } from '../components/Sheet';
import { showToast } from '../components/Toast';
import { useLongPressReorder } from '../hooks/useLongPressReorder';
import { buildListPayload } from '../lib/share';
import { sortTrips } from '../lib/trips';
import { formatRange } from '../lib/date';
import { navigate } from '../router';

/** 保存した持ち物リストの一覧（旅行を開かなくても見られる） */
export function PackingListsScreen() {
  const lists = useLiveQuery(() => db.packingLists.orderBy('name').toArray());
  const [creating, setCreating] = useState(false);
  return (
    <div className="screen">
      <header className="app-header">
        <button className="icon-btn" onClick={() => navigate({ name: 'list' })} aria-label="旅行一覧へ">‹</button>
        <h1 className="grow">持ち物リスト</h1>
        <button className="btn btn-ghost btn-small" onClick={() => setCreating(true)}>
          ＋ 作る
        </button>
      </header>
      <main className="content">
        {lists && lists.length === 0 ? (
          <div className="empty">
            <p>保存した持ち物リストはまだありません。</p>
            <p className="small">「＋ 作る」か、旅行の持ち物タブの「💾 リストとして保存」で作れます。</p>
          </div>
        ) : (
          <ul className="trip-list">
            {lists?.map((l) => {
              const done = (l.checked ?? []).filter((n) => l.items.includes(n)).length;
              return (
                <li key={l.id}>
                  <button className="trip-card list-card" onClick={() => navigate({ name: 'packingList', id: l.id })}>
                    <div className="trip-card-top">
                      <span className="trip-name">🎒 {l.name}</span>
                      <span className="muted small">
                        {done} / {l.items.length}個
                      </span>
                    </div>
                    <div className="trip-members">{l.items.slice(0, 6).join('・')}{l.items.length > 6 ? ' …' : ''}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      {creating && <EditListSheet onClose={() => setCreating(false)} />}
    </div>
  );
}

/** 持ち物リスト単体：チェックリストとして使う */
export function PackingListScreen({ id }: { id: string }) {
  const list = useLiveQuery(async () => (await db.packingLists.get(id)) ?? null, [id]);
  const [name, setName] = useState('');
  const [sheet, setSheet] = useState<'edit' | 'share' | 'trip' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const trashRef = useRef<HTMLDivElement>(null);

  const checked = new Set(list?.checked ?? []);
  // チェックしたものは下へ
  const rows = list ? [...list.items.filter((n) => !checked.has(n)), ...list.items.filter((n) => checked.has(n))] : [];
  const { bind, styleFor, draggingId, overTrash } = useLongPressReorder(rows, (names) => reorderListItems(id, names), {
    trashRef,
    onDelete: async (n) => {
      await removeListItem(id, n);
      showToast(`「${n}」を消しました`);
    },
  });

  // 消されたら一覧へ
  useEffect(() => {
    if (list === null) navigate({ name: 'packingLists' }, { replace: true });
  }, [list]);
  if (!list) return <div className="screen" />;

  const done = rows.filter((n) => checked.has(n)).length;
  const add = async () => {
    const n = name.trim();
    if (!n) return;
    setName('');
    inputRef.current?.focus();
    if (!(await addListItem(id, n))) showToast(`「${n}」はもうあります`);
  };

  return (
    <div className="screen">
      <header className="app-header">
        <button className="icon-btn" onClick={() => navigate({ name: 'packingLists' })} aria-label="持ち物リストの一覧へ">‹</button>
        <div className="header-title">
          <h1>🎒 {list.name}</h1>
          <div className="sub">持ち物リスト</div>
        </div>
        <button className="btn btn-ghost btn-small" onClick={() => setSheet('share')}>
          ↗ 共有
        </button>
        <button className="btn btn-ghost btn-small" onClick={() => setSheet('edit')}>
          編集
        </button>
      </header>

      <main className="content packing">
        {rows.length > 0 && (
          <div className="packing-head">
            <div className="packing-progress">
              <span>
                {done} / {rows.length} 個
              </span>
              <div className="bar">
                <div className="bar-fill" style={{ width: `${(done / rows.length) * 100}%` }} />
              </div>
            </div>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => uncheckList(id)} disabled={done === 0}>
              全部の選択を外す
            </button>
          </div>
        )}
        <div className="list-actions">
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setSheet('trip')}>
            🧳 旅行の持ち物に入れる
          </button>
        </div>

        {rows.length === 0 && <p className="empty">持ち物はまだありません。下の欄から追加できます。</p>}
        <ul className="packing-list">
          {rows.map((n, i) => (
            <li
              key={n}
              {...bind(n)}
              style={styleFor(i)}
              className={`packing-item ${checked.has(n) ? 'checked' : ''} ${draggingId === n ? 'dragging' : ''}`}
              onClick={() => toggleListItem(id, n)}
              role="checkbox"
              aria-checked={checked.has(n)}
            >
              <span className="packing-box" aria-hidden="true">
                {checked.has(n) ? '✓' : ''}
              </span>
              <span className="packing-name">{n}</span>
            </li>
          ))}
        </ul>
        {rows.length > 0 && <p className="hint center">タップでチェック。長押しでつかむと並び替え・削除ができます</p>}

        <form
          className="packing-add"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="持ち物を入力して Enter"
            enterKeyHint="done"
            aria-label="持ち物を追加"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault();
            }}
          />
          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
            追加
          </button>
        </form>

        {draggingId && (
          <div ref={trashRef} className={`trash-zone ${overTrash ? 'active' : ''}`} aria-hidden="true">
            🗑 {overTrash ? '離すと削除' : 'ここに持ってくると削除'}
          </div>
        )}
      </main>

      {sheet === 'edit' && <EditListSheet list={list} onClose={() => setSheet(null)} />}
      {sheet === 'share' && (
        <Sheet title="持ち物リストを共有" onClose={() => setSheet(null)}>
          <div className="form">
            <p className="muted small">リストの名前と持ち物の名前（{list.items.length}個）を送ります。チェックの状態は送りません。</p>
            <ShareButtons payload={buildListPayload(list.name, list.items)} title={`持ち物リスト「${list.name}」`} fileBase="packing-list" />
          </div>
        </Sheet>
      )}
      {sheet === 'trip' && <ToTripSheet names={list.items} listName={list.name} onClose={() => setSheet(null)} />}
    </div>
  );
}

/** リストを、選んだ旅行の持ち物に入れる */
function ToTripSheet({ names, listName, onClose }: { names: string[]; listName: string; onClose: () => void }) {
  const trips = useLiveQuery(async () => sortTrips(await db.trips.toArray()));
  const [tripId, setTripId] = useState('');
  const target = tripId || trips?.[0]?.id || '';
  const targetName = trips?.find((t) => t.id === target)?.name ?? '';
  const missing = useLiveQuery(async () => (target ? countMissingPacking(target, names) : 0), [target, names]);

  const put = async (mode: 'merge' | 'replace') => {
    if (!target) return;
    if (mode === 'replace' && !confirm(`「${targetName}」の持ち物を「${listName}」（${names.length}個）に入れ替えますか？\n今ある持ち物とチェックは消えます。`)) return;
    const n = await putPackingNames(target, names, mode);
    showToast(mode === 'replace' ? '入れ替えました' : `${n}個追加しました`);
    navigate({ name: 'trip', tripId: target, tab: 'packing' });
  };

  return (
    <Sheet title="旅行の持ち物に入れる" onClose={onClose}>
      <div className="form">
        {!trips ? null : trips.length === 0 ? (
          <p className="muted">旅行がまだありません。旅行を作るときに「持ち物リストをコピー」でこのリストを選べます。</p>
        ) : (
          <>
            <label className="field">
              <span className="label">入れる旅行</span>
              <select value={target} onChange={(e) => setTripId(e.target.value)} aria-label="入れる旅行">
                {trips?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}（{formatRange(t.startDate, t.endDate)}）
                  </option>
                ))}
              </select>
            </label>
            <PutButtons missing={missing} total={names.length} disabled={!target} onPut={put} />
          </>
        )}
      </div>
    </Sheet>
  );
}
