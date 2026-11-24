import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** 新しい版が公開されたら知らせる。「更新」で入れ替え（勝手には再読み込みしない） */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // 開きっぱなしでも 1時間ごとに新しい版を確認する
      if (reg) setInterval(() => reg.update().catch(() => undefined), 60 * 60 * 1000);
    },
  });

  // 保存したデータをブラウザが勝手に消しにくくする（対応しているブラウザだけ）
  useEffect(() => {
    navigator.storage?.persist?.().catch(() => undefined);
  }, []);

  if (!needRefresh) return null;
  return (
    <div className="update-banner" role="status">
      <span>新しいバージョンがあります</span>
      <button type="button" className="btn btn-small btn-primary" onClick={() => updateServiceWorker(true)}>
        更新
      </button>
      <button type="button" className="btn-text" onClick={() => setNeedRefresh(false)}>
        あとで
      </button>
    </div>
  );
}
