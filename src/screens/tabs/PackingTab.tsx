import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import type { Trip } from '../../db/types';
import { addPacking, deletePacking, reorderPacking, togglePacking, uncheckAll } from '../../db/packingRepo';
import { useLongPressReorder } from '../../hooks/useLongPressReorder';
import { showToast } from '../../components/Toast';
import { AddFromListSheet, SaveListSheet } from '../../components/PackingListSheets';

type Props = { trip: Trip };

export function PackingTab({ trip }: Props) {
  const [name, setName] = useState('');
  const [sheet, setSheet] = useState<'save' | 'add' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const trashRef = useRef<HTMLDivElement>(null);

  // チェックしたものは下へ（それぞれの中では並べた順）
  const items = useLiveQuery(
    async () =>
      (await db.packingItems.where('tripId').equals(trip.id).toArray()).sort(
        (a, b) => Number(a.checked) - Number(b.checked) || a.order - b.order,
      ),
    [trip.id],
  );

  const { bind, styleFor, draggingId, overTrash } = useLongPressReorder(
    (items ?? []).map((p) => p.id),
    (ids) => reorderPacking(ids),
    {
      trashRef,
      onDelete: async (id) => {
        const p = items?.find((x) => x.id === id);
        if (!p) return;
        await deletePacking(id);
        showToast(`「${p.name}」を消しました`);
      },
    },
  );

  if (!items) return null;
  const done = items.filter((p) => p.checked).length;

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    // 先に欄を空にする（保存を待ってから消すと、すぐ打った次の入力まで消えてしまう）
    setName('');
    // 続けて入れられるようにフォーカスを残す
    inputRef.current?.focus();
    await addPacking(trip.id, n);
  };

  return (
    <div className="packing">
      {items.length > 0 && (
        <div className="packing-head">
          <div className="packing-progress">
            <span>
              {done} / {items.length} 個
            </span>
            <div className="bar">
              <div className="bar-fill" style={{ width: `${(done / items.length) * 100}%` }} />
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => uncheckAll(trip.id)} disabled={done === 0}>
            全部の選択を外す
          </button>
        </div>
      )}

      <div className="list-actions">
        <button type="button" className="btn btn-ghost btn-small" onClick={() => setSheet('add')}>
          📋 保存したリストから追加
        </button>
        {items.length > 0 && (
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setSheet('save')}>
            💾 リストとして保存
          </button>
        )}
      </div>

      {items.length === 0 && <p className="empty">持ち物はまだありません。下の欄から追加できます。</p>}

      <ul className="packing-list">
        {items.map((p, i) => (
          <li
            key={p.id}
            {...bind(p.id)}
            style={styleFor(i)}
            className={`packing-item ${p.checked ? 'checked' : ''} ${draggingId === p.id ? 'dragging' : ''}`}
            onClick={() => togglePacking(p.id)}
            role="checkbox"
            aria-checked={p.checked}
          >
            <span className="packing-box" aria-hidden="true">
              {p.checked ? '✓' : ''}
            </span>
            <span className="packing-name">{p.name}</span>
          </li>
        ))}
      </ul>
      {items.length > 0 && <p className="hint center">タップでチェック。長押しでつかむと並び替え・削除ができます</p>}

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
            // 日本語の変換を確定する Enter では追加しない
            if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault();
          }}
        />
        <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
          追加
        </button>
      </form>

      {sheet === 'save' && <SaveListSheet tripId={trip.id} defaultName={`${trip.name}の持ち物`} onClose={() => setSheet(null)} />}
      {sheet === 'add' && <AddFromListSheet tripId={trip.id} onClose={() => setSheet(null)} />}

      {draggingId && (
        <div ref={trashRef} className={`trash-zone ${overTrash ? 'active' : ''}`} aria-hidden="true">
          🗑 {overTrash ? '離すと削除' : 'ここに持ってくると削除'}
        </div>
      )}
    </div>
  );
}
