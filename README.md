# たびメモ（旅程アプリ）

仕様は [SPEC.md](./SPEC.md)。現在は **開発ステップ1（土台）** まで。

## コマンド

| コマンド | 内容 |
| --- | --- |
| `npm install` | 初回だけ |
| `npm run dev` | 開発サーバー（同じ Wi-Fi のスマホからも開ける） |
| `npm test` | テスト（Vitest） |
| `npm run build` | 型チェック＋本番ビルド（`dist/`） |
| `npm run preview` | ビルド結果を確認 |

## 構成

```
src/
  db/types.ts       データ型（SPEC のデータ設計どおり）
  db/db.ts          Dexie のテーブル定義（6テーブル）とカテゴリ初期値
  db/tripRepo.ts    旅行の作成・更新・削除（持ち物コピー、メンバー削除の制限）
  lib/trips.ts      並び順・入力チェック・金額入力の解釈（画面と切り離した関数）
  lib/date.ts       日付の表示・計算
  router.ts         ハッシュ（#/...）による画面切り替え
  screens/          旅行一覧・旅行の作成/編集・旅行ごとの画面（タブの枠）
```
