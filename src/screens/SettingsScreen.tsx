import { useState } from 'react';
import type { Category, ItemKindDef } from '../db/types';
import { useCategories, useItemKinds } from '../hooks/useKinds';
import { IconNameSheet } from '../components/IconNameSheet';
import { LOCKED_CATEGORIES, LOCKED_KINDS } from '../lib/kinds';
import { navigate } from '../router';

type Editing = { mode: 'category'; target?: Category } | { mode: 'kind'; target?: ItemKindDef } | null;

export function SettingsScreen() {
  const categories = useCategories();
  const kinds = useItemKinds();
  const [editing, setEditing] = useState<Editing>(null);
  // カテゴリは ID 順（最初から入っている順 → 足した順）で並べる
  const cats = [...(categories ?? [])].sort((a, b) => a.id.localeCompare(b.id));

  return (
    <div className="screen">
      <header className="app-header">
        <button className="icon-btn" onClick={() => navigate({ name: 'list' })} aria-label="旅行一覧へ">
          ‹
        </button>
        <h1>設定</h1>
      </header>

      <main className="content settings">
        <section className="card">
          <div className="settle-head">
            <h3 className="card-title">支出のカテゴリ</h3>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditing({ mode: 'category' })}>
              ＋ 追加
            </button>
          </div>
          <p className="muted small">支出の入力ではよく使う順に並びます。タップで名前・アイコンの変更や削除ができます。</p>
          <ul className="setting-list">
            {cats.map((c) => (
              <li key={c.id}>
                <button type="button" className="setting-row" onClick={() => setEditing({ mode: 'category', target: c })}>
                  <span className="setting-icon">{c.icon}</span>
                  <span className="setting-name">{c.name}</span>
                  {LOCKED_CATEGORIES.has(c.id) && <span className="muted small">削除不可</span>}
                  <span className="muted">›</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <div className="settle-head">
            <h3 className="card-title">予定の種類</h3>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditing({ mode: 'kind' })}>
              ＋ 追加
            </button>
          </div>
          <p className="muted small">「移動」「宿泊」は専用の入力欄があるので削除できません。</p>
          <ul className="setting-list">
            {kinds.map((k) => (
              <li key={k.id}>
                <button type="button" className="setting-row" onClick={() => setEditing({ mode: 'kind', target: k })}>
                  <span className="setting-icon">{k.icon}</span>
                  <span className="setting-name">{k.name}</span>
                  <span className="muted small">→ {categories?.find((c) => c.id === k.categoryId)?.name ?? 'その他'}</span>
                  {LOCKED_KINDS.has(k.id) && <span className="muted small">削除不可</span>}
                  <span className="muted">›</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </main>

      {editing?.mode === 'category' && <IconNameSheet mode="category" target={editing.target} onClose={() => setEditing(null)} />}
      {editing?.mode === 'kind' && <IconNameSheet mode="kind" target={editing.target} onClose={() => setEditing(null)} />}
    </div>
  );
}
