// JSON でのバックアップと復元（機種変更やブラウザのデータ消去に備える）
import { db } from '../db/db';

/** バックアップに入れるテーブル（すべて） */
export const BACKUP_TABLES = [
  'trips',
  'itineraryItems',
  'expenses',
  'packingItems',
  'packingLists',
  'categories',
  'itemKinds',
  'repayments',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export type Backup = {
  app: 'tabimemo';
  schema: number; // 書き出したときの DB のバージョン
  exportedAt: string;
  data: Record<BackupTable, unknown[]>;
};

export async function exportBackup(now = new Date().toISOString()): Promise<Backup> {
  const data = {} as Backup['data'];
  await db.transaction('r', BACKUP_TABLES.map((t) => db.table(t)), async () => {
    for (const t of BACKUP_TABLES) data[t] = await db.table(t).toArray();
  });
  return { app: 'tabimemo', schema: db.verno, exportedAt: now, data };
}

/** 中身を確かめる。問題があればメッセージを返す */
export function checkBackup(json: unknown): { ok: true; backup: Backup } | { ok: false; error: string } {
  const b = json as Backup;
  if (!b || typeof b !== 'object' || b.app !== 'tabimemo' || !b.data || typeof b.data !== 'object') {
    return { ok: false, error: 'たびメモのバックアップファイルではありません' };
  }
  if (typeof b.schema === 'number' && b.schema > db.verno) {
    return { ok: false, error: 'このアプリより新しい版で書き出したファイルです。アプリを更新してから読み込んでください' };
  }
  for (const t of ['trips', 'itineraryItems', 'expenses'] as const) {
    if (!Array.isArray(b.data[t])) return { ok: false, error: `ファイルが壊れています（${t} がありません）` };
  }
  return { ok: true, backup: b };
}

/** 件数の要約（読み込む前の確認に使う） */
export function backupSummary(b: Backup): string {
  const n = (t: BackupTable) => (Array.isArray(b.data[t]) ? b.data[t].length : 0);
  return `旅行 ${n('trips')}件・予定 ${n('itineraryItems')}件・支出 ${n('expenses')}件・持ち物 ${n('packingItems')}個・持ち物リスト ${n('packingLists')}件`;
}

/** 古い版で書き出したデータを、今の形にそろえる */
function upgradeRows(table: BackupTable, rows: unknown[]): unknown[] {
  if (table !== 'itineraryItems') return rows;
  return rows.map((r) => {
    const it = { ...(r as Record<string, unknown>) };
    if (!Array.isArray(it.places)) {
      const place = typeof it.place === 'string' ? it.place.trim() : '';
      it.places = place ? [place] : [];
      delete it.place;
    }
    if (!it.kind) it.kind = 'other';
    return it;
  });
}

/** 今のデータを全部消して、バックアップの中身に置き換える */
export async function restoreBackup(b: Backup): Promise<void> {
  await db.transaction('rw', BACKUP_TABLES.map((t) => db.table(t)), async () => {
    for (const t of BACKUP_TABLES) {
      const rows = Array.isArray(b.data[t]) ? b.data[t] : undefined;
      // 古いバックアップにないテーブル（例：持ち物リスト）は、今の中身を残す
      if (!rows) continue;
      await db.table(t).clear();
      await db.table(t).bulkAdd(upgradeRows(t, rows));
    }
  });
}

export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `tabimemo-backup-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`;
}
