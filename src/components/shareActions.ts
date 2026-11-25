import { MAX_URL_LENGTH, shareUrl, type SharePayload } from '../lib/share';
import { copyText } from '../lib/clipboard';
import { showToast } from './Toast';

/** 共有の送り方（共有メニュー・リンクのコピー・長いときはファイル） */
export function shareActions(payload: SharePayload, title: string, fileBase: string) {
  const url = shareUrl(payload);
  const tooLong = url.length > MAX_URL_LENGTH;

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: `${title}（たびメモ）\nホーム画面のたびメモで開くときは、リンクをコピーして「🔗 共有リンクを貼り付けて開く」へ`,
          url,
        });
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

  const shareFile = () => saveJsonFile(`tabimemo-${fileBase}.json`, payload, title);

  return { url, tooLong, shareLink, copyLink, shareFile };
}

/**
 * JSON をファイルにして渡す。スマホの共有メニュー（ファイルを送れる場合）か、ファイルとして保存。
 * ファイル名は英数字だけにする（日本語の名前を受け付けないブラウザがあるため）
 */
export async function saveJsonFile(name: string, data: unknown, title: string): Promise<void> {
  const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
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
}
