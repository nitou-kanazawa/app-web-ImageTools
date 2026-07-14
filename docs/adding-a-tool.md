# 新しいツールの追加ガイド

このリポジトリは「フォルダを1つ追加するだけ」で新しいツールが増える設計になっている。

## 1. フォルダを作る

```
src/tools/<tool-name>/
```

`<tool-name>` はそのまま URL スラッグ（`/#/tools/<tool-name>`）になる。kebab-case を使う。

## 2. `tool.tsx` を書く

最低限のテンプレート:

```tsx
import { useState } from 'react';
import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
  slug: 'my-tool', // ← フォルダ名と一致させる
  title: 'マイツール',
  description: 'このツールが何をするかを1〜2文で。',
  tags: ['text'], // 任意
};

export default function MyTool() {
  const [value, setValue] = useState('');
  return (
    <div className="space-y-4">
      <input
        aria-label="入力"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-lg border border-slate-300 p-3 dark:border-slate-700 dark:bg-slate-900"
      />
      <p className="text-slate-600 dark:text-slate-400">入力: {value}</p>
    </div>
  );
}
```

これだけで、トップページの一覧とルーティングに自動で追加される（`registry.ts` の編集は不要）。

## 3. ロジックを分離してテストする

計算・変換ロジックは UI から切り離す。

```
src/tools/<tool-name>/
  tool.tsx        ← 表示だけ
  logic.ts        ← 純粋関数
  logic.test.ts   ← Vitest テスト
```

```ts
// logic.ts
export function transform(input: string): string {
  return input.trim().toUpperCase();
}
```

```ts
// logic.test.ts
import { describe, it, expect } from 'vitest';
import { transform } from './logic';

describe('transform', () => {
  it('大文字にする', () => {
    expect(transform(' hello ')).toBe('HELLO');
  });
});
```

実装例は `src/tools/word-counter/` を参照。

## 4. 確認する

```bash
npm run dev          # ローカルで動作確認
npm run check        # typecheck + lint + format + test + build
npm run e2e          # E2E（トップ→各ツールの導線）
npm run screenshots  # screenshots/ に見た目を出力
```

## 設計上の約束

- **ロジックと UI を分ける**（テスト容易性のため）
- **Tailwind のユーティリティクラスで書く**（独自 CSS は足さない）
- **ダークモード対応**（`dark:` を付ける）
- **入力要素に `aria-label`**（E2E が参照しやすい）
- **クライアントサイドのみ**（サーバ・秘密情報を持ち込まない）
