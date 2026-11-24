import type { SharePayload } from '../lib/share';
import { shareActions } from './shareActions';

/** 共有の注意と送るボタン（リンクが長すぎるときはファイル） */
export function ShareButtons({ payload, title, fileBase }: { payload: SharePayload; title: string; fileBase: string }) {
  const { url, tooLong, shareLink, copyLink, shareFile } = shareActions(payload, title, fileBase);
  return (
    <>
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
    </>
  );
}
