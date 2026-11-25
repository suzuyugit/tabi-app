import { useState } from 'react';
import { db } from '../db/db';
import { copyText } from '../lib/clipboard';
import { formatMd } from '../lib/date';
import { isoDate, isoTime } from '../lib/datetime';
import { buildLedger, encodeLedger } from '../lib/ledger';
import { showToast } from './Toast';

const LAST_KEY = 'tabi.lastLedgerAt';

function loadLast(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

/** 設定画面の「家計簿に送る」。全部の旅行の自分の負担分（円）をクリップボードにコピーする */
export function KakeiboSection() {
  const [last, setLast] = useState(loadLast);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      const [trips, expenses, items, kinds, categories] = await Promise.all([
        db.trips.toArray(),
        db.expenses.toArray(),
        db.itineraryItems.toArray(),
        db.itemKinds.toArray(),
        db.categories.toArray(),
      ]);
      const p = buildLedger({ trips, expenses, items, kinds, categories });
      const ok = await copyText(encodeLedger(p));
      if (!ok) return showToast('コピーできませんでした');
      try {
        localStorage.setItem(LAST_KEY, p.exportedAt);
      } catch {
        // 覚えられなくてもよい
      }
      setLast(p.exportedAt);
      showToast(`コピーしました（旅行${p.trips.length}件・支出${p.entries.length}件）`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h3 className="card-title">家計簿に送る</h3>
      <p className="muted small">
        全部の旅行の「自分の負担分」を円にしてコピーします。家計簿アプリで「たびメモから取り込む」を押すと入ります。何度送っても二重にはならず、最新の内容に置き換わります。
      </p>
      <p className="small">前回送った日時：{last ? `${formatMd(isoDate(last))} ${isoTime(last)}` : 'まだありません'}</p>
      <button type="button" className="btn btn-primary btn-block" onClick={send} disabled={busy}>
        💴 家計簿に送る（コピー）
      </button>
    </section>
  );
}
