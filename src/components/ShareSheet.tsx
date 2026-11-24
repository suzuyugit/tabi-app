import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Trip } from '../db/types';
import { buildPayload, isPersonal, MAX_URL_LENGTH, shareUrl, type ShareKind } from '../lib/share';
import { copyText } from '../lib/clipboard';
import { Sheet } from './Sheet';
import { showToast } from './Toast';

type Props = { trip: Trip; onClose: () => void };

/** 旅程・割り勘を URL（長ければ JSON ファイル）で共有する */
export function ShareSheet({ trip, onClose }: Props) {
  const [kind, setKind] = useState<ShareKind>('itinerary');
  const data = useLiveQuery(async () => {
    const [items, kinds, expenses, categories, repayments] = await Promise.all([
      db.itineraryItems.where('tripId').equals(trip.id).toArray(),
      db.itemKinds.toArray(),
      db.expenses.where('tripId').equals(trip.id).toArray(),
      db.categories.toArray(),
      db.repayments.where('tripId').equals(trip.id).toArray(),
    ]);
    return { items, kinds, expenses, categories, repayments };
  }, [trip.id]);

  if (!data) return null;
  const payload = buildPayload(kind, trip, data);
  const url = shareUrl(payload);
  const tooLong = url.length > MAX_URL_LENGTH;
  const title = `${trip.name}の${kind === 'itinerary' ? '旅程' : '割り勘'}`;
  const sharedCount = data.expenses.filter((e) => !isPersonal(e)).length;

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, text: `${title}（たびメモ）`, url });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return; // 共有メニューを閉じただけ
      }
    }
    const ok = await copyText(url);
    showToast(ok ? 'リンクをコピーしました' : 'コピーできませんでした');
  };

  const copyLink = async () => {
    const ok = await copyText(url);
    showToast(ok ? 'リンクをコピーしました' : 'コピーできませんでした');
  };

  const shareFile = async () => {
    // ファイル名は英数字だけにする（日本語の名前を受け付けないブラウザがあるため）
    const name = `tabimemo-${kind === 'itinerary' ? 'itinerary' : 'settle'}-${trip.startDate.replace(/-/g, '')}.json`;
    const file = new File([JSON.stringify(payload)], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    // 共有メニューが使えないときはファイルとして保存
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    document.body.appendChild(a); // ページに置かないとファイル名が使われないブラウザがある
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    showToast('ファイルを保存しました');
  };

  return (
    <Sheet title="共有" onClose={onClose}>
      <div className="form">
        <div className="seg" role="radiogroup" aria-label="共有するもの">
          {(['itinerary', 'settle'] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>
              {k === 'itinerary' ? '🗓️ 旅程' : '🤝 割り勘'}
            </button>
          ))}
        </div>

        <div className="card share-contents">
          <div className="card-label">送るもの</div>
          <ul>
            <li>旅行名・日程・メンバー（{trip.members.map((m) => m.name).join('・')}）</li>
            {kind === 'itinerary' ? (
              <li>予定 {data.items.length}件</li>
            ) : (
              <>
                <li>割り勘した支出 {sharedCount}件（精算表は受け取った側で計算）</li>
                {data.repayments.length > 0 && <li>渡したお金の記録 {data.repayments.length}件</li>}
              </>
            )}
          </ul>
          <div className="card-label">送らないもの</div>
          <p className="muted small">予算・手持ち現金・個人の支出・持ち物</p>
        </div>

        <p className="share-warning" role="note">
          ⚠ リンク（ファイル）を知っている人は、誰でも中身を見られます。送る相手に気をつけてください。内容を変えたら送り直してください。
        </p>

        {tooLong ? (
          <>
            <p className="muted small">
              データが多くリンクが長すぎる（{url.length.toLocaleString()}文字）ので、JSON ファイルで送ります。受け取った人は、設定の「共有ファイルを開く」から読み込めます。
            </p>
            <button type="button" className="btn btn-primary btn-block" onClick={shareFile}>
              📄 ファイルで共有する
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-primary btn-block" onClick={shareLink}>
              ↗ LINE などで共有する
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={copyLink}>
              🔗 リンクをコピー
            </button>
            <p className="muted small center">リンクの長さ：{url.length.toLocaleString()}文字</p>
          </>
        )}
      </div>
    </Sheet>
  );
}
