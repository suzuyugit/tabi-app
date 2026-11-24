import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { PackingList } from '../db/types';
import { countMissingPacking, deletePackingList, namesFromText, putPackingNames, savePackingList, tripPackingNames } from '../db/packingRepo';
import { buildListPayload } from '../lib/share';
import { Sheet } from './Sheet';
import { ShareButtons } from './ShareButtons';
import { showToast } from './Toast';

/** 旅行の持ち物を、名前を付けて保存する（同じ名前があれば上書きするか確認） */
export function SaveListSheet({ tripId, defaultName, onClose }: { tripId: string; defaultName: string; onClose: () => void }) {
  const [name, setName] = useState(defaultName);
  const lists = useLiveQuery(() => db.packingLists.toArray());
  const save = async () => {
    const n = name.trim();
    if (!n) return showToast('名前を入れてください');
    const same = lists?.find((l) => l.name === n);
    if (same && !confirm(`「${n}」はもうあります。上書きしますか？`)) return;
    const items = await tripPackingNames(tripId);
    await savePackingList(n, items, same?.id);
    showToast(`「${n}」として保存しました（${items.length}個）`);
    onClose();
  };
  return (
    <Sheet
      title="持ち物リストとして保存"
      onClose={onClose}
      action={
        <button type="button" className="btn btn-primary btn-small" onClick={save}>
          保存
        </button>
      }
    >
      <div className="form">
        <label className="field">
          <span className="label">リストの名前</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：国内1泊セット" autoFocus />
        </label>
        <p className="muted small">
          この旅行の持ち物の名前を保存します（チェックの状態は保存しません）。保存したリストは、旅行を作るときのコピーや、ほかの旅行の持ち物タブで使えます。設定画面で編集・共有もできます。
        </p>
      </div>
    </Sheet>
  );
}

/** 保存したリストを、旅行の持ち物に入れる */
export function AddFromListSheet({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const lists = useLiveQuery(() => db.packingLists.orderBy('name').toArray());
  const [listId, setListId] = useState('');
  const list = lists?.find((l) => l.id === (listId || lists?.[0]?.id));
  const missing = useLiveQuery(async () => (list ? countMissingPacking(tripId, list.items) : 0), [tripId, list]);

  const add = async (mode: 'merge' | 'replace') => {
    if (!list) return;
    if (mode === 'replace' && !confirm(`この旅行の持ち物を「${list.name}」（${list.items.length}個）に入れ替えますか？\n今ある持ち物とチェックは消えます。`)) return;
    const n = await putPackingNames(tripId, list.items, mode);
    showToast(mode === 'replace' ? `「${list.name}」に入れ替えました` : `${n}個追加しました`);
    onClose();
  };

  return (
    <Sheet title="保存したリストから追加" onClose={onClose}>
      <div className="form">
        {lists && lists.length === 0 ? (
          <p className="muted">保存した持ち物リストはまだありません。持ち物タブの「💾 リストとして保存」で作れます。</p>
        ) : (
          <>
            <ul className="check-list">
              {lists?.map((l) => (
                <li key={l.id}>
                  <label className="check-row">
                    <input type="radio" name="list" checked={l.id === list?.id} onChange={() => setListId(l.id)} />
                    <span>
                      {l.name} <span className="muted small">{l.items.length}個</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <PutButtons missing={missing} total={list?.items.length ?? 0} disabled={!list} onPut={add} />
          </>
        )}
      </div>
    </Sheet>
  );
}

/** 保存したリストの編集・共有・削除（設定画面から） */
export function EditListSheet({ list, onClose }: { list?: PackingList; onClose: () => void }) {
  const [name, setName] = useState(list?.name ?? '');
  const [text, setText] = useState((list?.items ?? []).join('\n'));
  const [sharing, setSharing] = useState(false);
  const items = namesFromText(text);

  const save = async () => {
    if (!name.trim()) return showToast('名前を入れてください');
    await savePackingList(name, items, list?.id);
    showToast(`「${name.trim()}」を保存しました`);
    onClose();
  };
  const remove = async () => {
    if (!list || !confirm(`持ち物リスト「${list.name}」を削除しますか？`)) return;
    await deletePackingList(list.id);
    showToast('削除しました');
    onClose();
  };

  return (
    <Sheet
      title={list ? '持ち物リストを編集' : '持ち物リストを作る'}
      onClose={onClose}
      action={
        <button type="button" className="btn btn-primary btn-small" onClick={save}>
          保存
        </button>
      }
    >
      <div className="form">
        <label className="field">
          <span className="label">リストの名前</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：国内1泊セット" />
        </label>
        <label className="field">
          <span className="label">持ち物（1行に1つ）・{items.length}個</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder={'充電器\n歯ブラシ\n着替え'} />
        </label>
        {list &&
          (sharing ? (
            <ShareButtons payload={buildListPayload(name.trim() || list.name, items)} title={`持ち物リスト「${name.trim() || list.name}」`} fileBase={`packing-list`} />
          ) : (
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setSharing(true)}>
              ↗ このリストを共有
            </button>
          ))}
        {list && (
          <button type="button" className="btn btn-danger-outline btn-block" onClick={remove}>
            このリストを削除
          </button>
        )}
      </div>
    </Sheet>
  );
}

/** 「ないものだけ追加」「全部入れ替える」の2つのボタン（押したらすぐ実行。入れ替えは確認あり） */
export function PutButtons({
  missing,
  total,
  disabled,
  onPut,
}: {
  missing: number | undefined;
  total: number;
  disabled?: boolean;
  onPut: (mode: 'merge' | 'replace') => void;
}) {
  return (
    <div className="put-buttons">
      <button type="button" className="btn btn-primary btn-block" onClick={() => onPut('merge')} disabled={disabled || missing === 0}>
        {missing === 0 ? '追加するもの（ないもの）はありません' : `ないものだけ追加（${missing ?? 0}個）`}
      </button>
      <p className="muted small">今ある持ち物とチェックはそのままです。</p>
      <button type="button" className="btn btn-danger-outline btn-block" onClick={() => onPut('replace')} disabled={disabled}>
        全部入れ替える（{total}個に）
      </button>
      <p className="muted small">今ある持ち物とチェックを消して、このリストにします（確認が出ます）。</p>
    </div>
  );
}
