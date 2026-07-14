# Web MiniTools Template

ブラウザで動く小さなツールを**量産する**ためのテンプレート。
仕様を Claude Code に渡せば、実装〜動作確認〜スクリーンショット〜ドキュメント整備まで自律的に進められ、**PR レビューで実物を触りながら成果物を評価できる**ことを狙った構成になっている。

## 特徴

- 🧩 **ツールはフォルダを1つ追加するだけ** — `src/tools/<name>/` を置けば一覧・ルーティングに自動登録（`registry.ts` の編集不要）
- 🤖 **Claude が自己検証できる** — Playwright でツールを起動・操作し、スクリーンショットを撮影
- 👀 **PR で実物を触れる** — PR ごとに GitHub Pages へプレビューを公開し、URL を自動コメント
- ✅ **品質ゲート** — CI で typecheck / lint / format / test / build / E2E を実行
- 📄 **ドキュメント整備済み** — `CLAUDE.md` に作業規約、`docs/` に追加ガイド

## 技術スタック

Vite + React + TypeScript / Tailwind CSS / react-router-dom / Vitest / Playwright

## クイックスタート

```bash
npm install
npm run dev          # 開発サーバ
npm run check        # typecheck + lint + format:check + test + build
npm run e2e          # E2E テスト
npm run screenshots  # 全ツールのスクショを screenshots/ に出力
```

## ツールを追加する

`src/tools/<name>/tool.tsx` を作り、`meta` とコンポーネントを default export するだけ。
詳しくは [docs/adding-a-tool.md](docs/adding-a-tool.md) と [CLAUDE.md](CLAUDE.md) を参照。

サンプル: [`src/tools/word-counter/`](src/tools/word-counter/)

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

## GitHub Pages / PR プレビューのセットアップ

PR プレビューと本番公開を有効にするには、リポジトリ側で一度だけ設定が必要:

1. **Settings → Actions → General → Workflow permissions** を
   **Read and write permissions** にする（`gh-pages` ブランチへの push とコメントのため）。
2. 初回の `main` への push 後、`gh-pages` ブランチが作られる。
3. **Settings → Pages** で **Source = Deploy from a branch**、
   **Branch = `gh-pages` / (root)** を選択。
4. 以降、
   - `main` への push → 本番サイトを公開
   - PR の作成/更新 → `pr-preview/pr-<番号>/` にプレビューを公開し、PR に URL をコメント
   - PR のクローズ → プレビューを自動削除

## ディレクトリ構成

```
src/
  tools/            各ツール（1ツール1フォルダ） + 自動登録レジストリ
  components/       共有 UI（一覧・レイアウト）
e2e/                Playwright（smoke / screenshots）
docs/               追加ガイド
.github/workflows/  CI・本番デプロイ・PR プレビュー
CLAUDE.md           Claude Code 向けの作業規約
```
