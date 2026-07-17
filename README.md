# Web MiniTools — Image Tools

ブラウザだけで完結する画像編集ツール集。**すべての処理はクライアントサイドで実行され、画像がサーバへ送信されることはない**（AI 機能もブラウザ内で推論する）。

公開ページ: **https://nitou-kanazawa.github.io/app-web-ImageTools/**

## ツール

| ツール             | 内容                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **マスク画像作成** | 画像の上をブラシでなぞって白黒マスク PNG を作成。Ctrl+ホイールでブラシサイズ変更、undo、反転出力、マスク適用済みの切り抜き PNG 出力にも対応 |
| **背景除去**       | AI による自動除去（人物向け / 汎用モデルを選択）+ 手動ブラシ（消す / 戻す）で微調整。透過 PNG を出力                                        |
| **深度マップ生成** | Depth Anything V2 で深度マップを自動生成。横並び / ワイパー式の重ねて比較、カラーマップ切替（グレー / 反転 / Viridis / Inferno）、PNG 出力  |
| 文字数カウンター   | テキストの文字数・単語数・行数をリアルタイム表示（サンプルツール）                                                                          |

### 共通の操作

- 画像は**ドラッグ&ドロップ / Ctrl+V（貼り付け）**でいつでも差し替え可能（連続処理向け）
- **VS Code 風の UI** — サイドバー（Ctrl+B で開閉）・ステータスバー・テーマ切替（ダーク / ライト / OS 連動）
- 深度マップは「読み込み時に自動生成」を ON にすると、ドロップするだけで結果が出る

### AI 機能について

- モデル（[Transformers.js](https://github.com/huggingface/transformers.js) + ONNX Runtime）は初回利用時に Hugging Face Hub からブラウザが直接ダウンロードし、以降はキャッシュされる
  - 背景除去: `Xenova/modnet`（人物向け・約25MB）/ `onnx-community/BiRefNet_lite`（汎用・約50MB）
  - 深度推定: `onnx-community/depth-anything-v2-small`（約25MB）
- WebGPU が使える環境では GPU で、使えない環境では WASM（CPU）で推論する

## 技術スタック

Vite + React + TypeScript / Tailwind CSS / react-router-dom (HashRouter) / Transformers.js / Vitest / Playwright

## 開発

```bash
npm install
npm run dev          # 開発サーバ
npm run check        # typecheck + lint + format:check + test + build
npm run e2e          # E2E テスト
npm run screenshots  # 全ツールのスクショを screenshots/ に出力
```

AI 機能の E2E（実モデルのダウンロード + 推論）はネットワークが必要なため CI でのみ実行される。ローカルで試す場合は `RUN_ML_E2E=1 npm run e2e` を使う。

## ツールを追加する

`src/tools/<name>/tool.tsx` を作り、`meta` とコンポーネントを export するだけで一覧・ルーティングに自動登録される（`registry.ts` の編集不要）。
規約・デザイン指針は [CLAUDE.md](CLAUDE.md)、雛形は [docs/adding-a-tool.md](docs/adding-a-tool.md) を参照。

## スクリプト一覧

| コマンド              | 内容                                                  |
| --------------------- | ----------------------------------------------------- |
| `npm run dev`         | 開発サーバ起動                                        |
| `npm run build`       | 本番ビルド                                            |
| `npm run preview`     | ビルド結果をローカルでプレビュー                      |
| `npm run typecheck`   | 型チェック                                            |
| `npm run lint`        | ESLint                                                |
| `npm run format`      | Prettier で整形                                       |
| `npm run test`        | Vitest（ユニットテスト）                              |
| `npm run e2e`         | Playwright（E2E）                                     |
| `npm run screenshots` | 全ツールのスクリーンショット撮影                      |
| `npm run check`       | typecheck + lint + format:check + test + build を一括 |

## デプロイ

- `main` への push → `gh-pages` ブランチへビルドを公開（GitHub Pages）
- PR の作成/更新 → `pr-preview/pr-<番号>/` にプレビューを公開し、PR に URL を自動コメント（クローズで削除）
- CI（typecheck / lint / format / test / build / E2E + 実モデル推論）が品質ゲートとして走る

## ディレクトリ構成

```
src/
  tools/            各ツール（1ツール1フォルダ） + 自動登録レジストリ
    image-mask-editor/   マスク画像作成
    background-remover/  背景除去（自動 + 手動）
    depth-estimator/     深度マップ生成
    word-counter/        文字数カウンター（サンプル）
  components/       共有 UI（AppShell / アイコン / トグル / ドロップゾーン など）
  lib/              共有ロジック（ブラシ / undo / ML パイプライン / テーマ など）
e2e/                Playwright（smoke / 各ツール / screenshots）
docs/               追加ガイド
.github/workflows/  CI・本番デプロイ・PR プレビュー
CLAUDE.md           Claude Code 向けの作業規約・デザイン指針
```
