# CLAUDE.md

このリポジトリで Claude Code が作業するときの規約。**新しいツールを追加するときは、まずこのファイルを読むこと。**

## このリポジトリの目的

ブラウザで動く小さなツールを量産するためのテンプレート。1リポジトリに複数ツールが同居し、各ツールは独立したページとして動く。クライアントサイドのみ（サーバ・バックエンドは持たない）。

## 技術スタック

- **Vite + React + TypeScript** — ビルド/開発サーバ/UI
- **Tailwind CSS** — スタイリング（ユーティリティクラスで書く）
- **react-router-dom (HashRouter)** — ルーティング
- **Vitest** — ユニットテスト
- **Playwright** — E2E テスト & スクリーンショット撮影

## ディレクトリ構成

```
src/
  tools/
    registry.ts        ← 自動登録（編集不要）
    types.ts           ← ToolMeta 型
    <tool-name>/       ← 1ツール1フォルダ
      tool.tsx         ← meta と default export(コンポーネント) を持つ
      logic.ts         ← ロジックは UI から分離（テストしやすくする）
      logic.test.ts    ← ユニットテスト
  components/          ← 共有 UI（HomePage / ToolPage など）
e2e/                   ← Playwright（smoke / screenshots）
```

## 新しいツールを追加する手順

1. `src/tools/<tool-name>/` フォルダを作る（`<tool-name>` は URL スラッグになる。kebab-case）。
2. `tool.tsx` を作り、次の2つを export する:
   - `export const meta: ToolMeta = { slug, title, description, tags }`（`slug` はフォルダ名と一致させる）
   - `export default function ...`（React コンポーネント）
3. ロジックは `logic.ts` に分離し、`logic.test.ts` でテストを書く。
4. `registry.ts` は `import.meta.glob` で自動検出するので **編集不要**。トップページの一覧にも自動で出る。
5. 詳細な雛形は `docs/adding-a-tool.md` を参照。

## 守ること

- **ロジックと UI を分離する。** 計算・変換ロジックは `logic.ts` に置き、ユニットテストを書く。
- **Tailwind で書く。** 独自 CSS ファイルは原則追加しない。
- **ダークモード対応。** 既存コンポーネントに倣い `dark:` バリアントを付ける。
- **アクセシビリティ。** 入力要素には `aria-label` か `<label>` を付ける（E2E から参照しやすくなる）。
- **日本語 UI。** 表示文言は日本語で統一。

## 作業完了前に必ず実行する

```bash
npm run check   # typecheck + lint + format:check + test + build
npm run e2e     # E2E テスト
npm run screenshots   # screenshots/ に見た目を出力 → PR に添付
```

`npm run check` と `npm run e2e` が両方通ること。スクリーンショットで見た目を自己確認してから PR を出すこと。

## PR の出し方

- `.github/pull_request_template.md` のセクションを埋める。
- **見た目を伴う変更は必ずスクリーンショットを添付する**（`npm run screenshots` の出力）。
- PR を出すと CI（品質ゲート）と PR Preview（実物を触れる URL）が自動で走る。
