import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';

/** 同じ名前がなければそのまま、あれば「名前 (2)」「名前 (3)」… */
export function freeName(name: string, used: string[]): string {
  if (!used.includes(name)) return name;
  for (let i = 2; ; i++) if (!used.includes(`${name} (${i})`)) return `${name} (${i})`;
}

/**
 * 共有された旅行を保存するときの「保存する名前」と「上書き／別の旅行として保存」。
 * tripId と同じ旅行がこのスマホにあれば上書きか別保存かを選べ、同じ名前の別の旅行があれば知らせる
 */
export function useSaveAs(tripId: string, sharedName: string) {
  const trips = useLiveQuery(() => db.trips.toArray());
  const existing = trips?.find((t) => t.id === tripId);
  const [asNew, setAsNew] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const others = (trips ?? []).filter((t) => t.id !== tripId || asNew).map((t) => t.name);
  // 名前を自分で変えていなければ、ぶつからない名前を入れておく
  // 上書きのときは、このスマホで付けている名前のまま（自分で変えた名前を戻さない）
  const suggested = existing && !asNew ? existing.name : freeName(sharedName, others);
  useEffect(() => setName(null), [asNew]);
  const value = name ?? suggested;
  const clash = others.includes(value.trim());
  return { trips, existing, asNew, setAsNew, name: value, setName, clash };
}

export function SaveAsFields({ s, sharedName }: { s: ReturnType<typeof useSaveAs>; sharedName: string }) {
  return (
    <>
      {s.existing && (
        <div className="seg" role="radiogroup" aria-label="保存のしかた">
          <button type="button" role="radio" aria-checked={!s.asNew} className={!s.asNew ? 'active' : ''} onClick={() => s.setAsNew(false)}>
            上書きする
          </button>
          <button type="button" role="radio" aria-checked={s.asNew} className={s.asNew ? 'active' : ''} onClick={() => s.setAsNew(true)}>
            別の旅行として保存
          </button>
        </div>
      )}
      <div className="field">
        <label className="label" htmlFor="save-as-name">
          保存する名前
        </label>
        <input id="save-as-name" value={s.name} onChange={(e) => s.setName(e.target.value)} aria-label="保存する名前" />
        {s.clash ? (
          <p className="hint over">このスマホに「{s.name.trim()}」という旅行がもうあります。見分けやすい名前に変えられます。</p>
        ) : (
          s.name.trim() !== sharedName && <p className="hint">共有された名前は「{sharedName}」です。</p>
        )}
      </div>
    </>
  );
}
