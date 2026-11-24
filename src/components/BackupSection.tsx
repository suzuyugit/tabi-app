import { useState } from 'react';
import { backupFileName, backupSummary, checkBackup, exportBackup, restoreBackup } from '../lib/backup';
import { formatMd } from '../lib/date';
import { isoDate, isoTime } from '../lib/datetime';
import { saveJsonFile } from './shareActions';
import { showToast } from './Toast';

const LAST_KEY = 'tabi.lastBackupAt';

function loadLast(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

/** 設定画面の「バックアップ」 */
export function BackupSection() {
  const [last, setLast] = useState(loadLast);

  const doExport = async () => {
    const b = await exportBackup();
    await saveJsonFile(backupFileName(), b, 'たびメモのバックアップ');
    try {
      localStorage.setItem(LAST_KEY, b.exportedAt);
    } catch {
      // 覚えられなくてもよい
    }
    setLast(b.exportedAt);
  };

  const doImport = async (f: File) => {
    let json: unknown;
    try {
      json = JSON.parse(await f.text());
    } catch {
      return showToast('JSON ファイルとして読めませんでした');
    }
    const c = checkBackup(json);
    if (!c.ok) return showToast(c.error);
    const when = c.backup.exportedAt ? `${formatMd(isoDate(c.backup.exportedAt))} ${isoTime(c.backup.exportedAt)} に書き出した` : '';
    if (
      !confirm(
        `${when}バックアップを読み込みます。\n${backupSummary(c.backup)}\n\n今このスマホにあるデータは全部消えて、バックアップの中身に置き換わります。よろしいですか？`,
      )
    )
      return;
    await restoreBackup(c.backup);
    showToast('バックアップを読み込みました');
  };

  return (
    <section className="card">
      <h3 className="card-title">バックアップ</h3>
      <p className="muted small">
        データはこのスマホの中にだけ保存されています。機種変更やブラウザのデータ消去に備えて、ときどき書き出しておいてください（LINE の自分だけのトークや、クラウドのフォルダに送っておくと安心です）。
      </p>
      <p className="small">
        前回の書き出し：{last ? `${formatMd(isoDate(last))} ${isoTime(last)}` : <span className="over">まだありません</span>}
      </p>
      <p className="muted small">読み込むと、今このスマホにあるデータは全部バックアップの中身に置き換わります。</p>
      <button type="button" className="btn btn-primary btn-block" onClick={doExport}>
        ⬇ 書き出す（JSON ファイル）
      </button>
      <label className="btn btn-ghost btn-block file-btn backup-import">
        ⬆ バックアップから読み込む
        <input
          type="file"
          accept=".json,application/json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) doImport(f);
          }}
        />
      </label>
    </section>
  );
}
