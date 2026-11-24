import { useEffect, useState } from 'react';
import type { Category, ItemKindDef } from '../db/types';
import {
  addCategory,
  addItemKind,
  countExpensesInCategory,
  countItemsOfKind,
  deleteCategory,
  deleteItemKind,
  updateCategory,
  updateItemKind,
} from '../db/categoryRepo';
import { ICON_CHOICES, LOCKED_CATEGORIES, LOCKED_KINDS, OTHER_CATEGORY } from '../lib/kinds';
import { useCategories } from '../hooks/useKinds';
import { Sheet } from './Sheet';
import { showToast } from './Toast';

type Props =
  | { mode: 'category'; target?: Category; onClose: () => void; onSaved?: (id: string) => void }
  | { mode: 'kind'; target?: ItemKindDef; onClose: () => void; onSaved?: (id: string) => void };

/** 支出のカテゴリ／予定の種類の追加・編集（アイコンと名前） */
export function IconNameSheet(props: Props) {
  const { mode, target, onClose, onSaved } = props;
  const isKind = mode === 'kind';
  const what = isKind ? '予定の種類' : '支出のカテゴリ';
  const [icon, setIcon] = useState(target?.icon ?? '📌');
  const [name, setName] = useState(target?.name ?? '');
  const [categoryId, setCategoryId] = useState(isKind ? ((target as ItemKindDef | undefined)?.categoryId ?? OTHER_CATEGORY) : '');
  const [error, setError] = useState('');
  const [usedCount, setUsedCount] = useState<number | null>(null);
  const categories = useCategories();
  const locked = target ? (isKind ? LOCKED_KINDS.has(target.id) : LOCKED_CATEGORIES.has(target.id)) : false;

  useEffect(() => {
    if (!target) return;
    (isKind ? countItemsOfKind(target.id) : countExpensesInCategory(target.id)).then(setUsedCount);
  }, [isKind, target]);

  const save = async () => {
    const n = name.trim();
    const i = icon.trim();
    if (!n) return setError('名前を入れてください');
    if (!i) return setError('アイコンを選んでください');
    let id = target?.id;
    if (isKind) {
      if (id) await updateItemKind(id, { name: n, icon: i, categoryId });
      else id = await addItemKind({ name: n, icon: i, categoryId });
    } else {
      if (id) await updateCategory(id, { name: n, icon: i });
      else id = await addCategory(n, i);
    }
    showToast(`${what}「${n}」を${target ? '保存' : '追加'}しました`);
    onSaved?.(id);
    onClose();
  };

  const remove = async () => {
    if (!target) return;
    const moved = usedCount ? `\n使っている${isKind ? '予定' : '支出'}（${usedCount}件）は「その他」に移ります。` : '';
    if (!confirm(`${what}「${target.name}」を削除しますか？${moved}`)) return;
    if (isKind) await deleteItemKind(target.id);
    else await deleteCategory(target.id);
    showToast(`「${target.name}」を削除しました`);
    onClose();
  };

  return (
    <Sheet
      title={`${what}を${target ? '編集' : '追加'}`}
      onClose={onClose}
      action={
        <button type="button" className="btn btn-primary btn-small" onClick={save}>
          保存
        </button>
      }
    >
      <div className="form">
        {error && (
          <p className="errors" role="alert">
            {error}
          </p>
        )}
        <div className="icon-name-row">
          <span className="icon-preview" aria-hidden="true">
            {icon || '？'}
          </span>
          <label className="field">
            <span className="label">名前</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={isKind ? '例：温泉' : '例：ガソリン'} autoFocus={!target} />
          </label>
        </div>

        <div className="field">
          <span className="label">アイコン</span>
          <div className="icon-grid" role="radiogroup" aria-label="アイコン">
            {ICON_CHOICES.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={c === icon} className={`icon-choice ${c === icon ? 'active' : ''}`} onClick={() => setIcon(c)}>
                {c}
              </button>
            ))}
          </div>
          <label className="icon-custom">
            <span className="muted small">ほかの絵文字：</span>
            <input value={icon} onChange={(e) => setIcon([...e.target.value].slice(-2).join(''))} aria-label="アイコンを入力" />
          </label>
        </div>

        {isKind && (
          <label className="field">
            <span className="label">見積もりで入れる支出のカテゴリ</span>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {target &&
          (locked ? (
            <p className="muted small">
              {target.id === 'move' || target.id === 'stay'
                ? 'この種類には専用の入力欄があるので削除できません（名前とアイコンは変えられます）。'
                : '「その他」は削除したものの受け皿なので削除できません（名前とアイコンは変えられます）。'}
            </p>
          ) : (
            <button type="button" className="btn btn-danger-outline btn-block" onClick={remove}>
              この{isKind ? '種類' : 'カテゴリ'}を削除
              {usedCount ? `（${usedCount}件使用中）` : ''}
            </button>
          ))}
      </div>
    </Sheet>
  );
}
