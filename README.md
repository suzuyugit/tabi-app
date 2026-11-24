# たびメモ（旅程アプリ）

仕様は [SPEC.md](./SPEC.md)。開発ステップ1〜5 まで完了。公開先：https://suzuyugit.github.io/tabi-app/

## スマホで使う

1. スマホのブラウザで https://suzuyugit.github.io/tabi-app/ を開く
2. ホーム画面に追加する
   - iPhone（Safari）：共有ボタン → 「ホーム画面に追加」
   - Android（Chrome）：右上の︙ → 「ホーム画面に追加」または「アプリをインストール」
3. 一度開いておけば、機内モードでも開ける（共有だけは電波が必要）
4. データはスマホの中にだけ保存される。ときどき 設定 → バックアップ →「書き出す」で JSON を保存しておく
5. 新しい版を公開すると、アプリの上に「新しいバージョンがあります」と出るので「更新」を押す

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
  lib/trips.ts      旅行の並び順・入力チェック
  lib/settlement.ts 割り勘の精算（calcSettlement）
  lib/money.ts      合計・見積もり・現金の残り
  lib/currency.ts   通貨・換算
  lib/timezone.ts   時差
  lib/share.ts      共有リンク（lz-string で圧縮して URL の # 以降に入れる）
  lib/summary.ts    旅行のまとめ
  lib/backup.ts     JSON のバックアップと復元
  public/           アイコン（PWA）
  lib/date.ts       日付の表示・計算
  router.ts         ハッシュ（#/...）による画面切り替え
  screens/          旅行一覧・旅行の作成/編集・旅行ごとの画面と4つのタブ
```
