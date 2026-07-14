import { useState } from 'react';
import type { ToolMeta } from '../types';
import { countText } from './logic';

export const meta: ToolMeta = {
  slug: 'word-counter',
  title: '文字数カウンター',
  description: 'テキストの文字数・単語数・行数をリアルタイムに数えます。',
  tags: ['text', 'sample'],
};

export default function WordCounter() {
  const [text, setText] = useState('');
  const stats = countText(text);

  const items: { key: string; label: string; value: number }[] = [
    { key: 'characters', label: '文字数', value: stats.characters },
    { key: 'characters-no-spaces', label: '文字数（空白なし）', value: stats.charactersNoSpaces },
    { key: 'words', label: '単語数', value: stats.words },
    { key: 'lines', label: '行数', value: stats.lines },
  ];

  return (
    <div className="space-y-6">
      <textarea
        aria-label="入力テキスト"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="ここにテキストを入力..."
        rows={8}
        className="w-full resize-y rounded-lg border border-slate-300 bg-white p-4 font-mono text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900"
      />
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {items.map((item) => (
          <div
            key={item.key}
            data-testid={`stat-${item.key}`}
            className="rounded-lg border border-slate-200 bg-white p-4 text-center dark:border-slate-800 dark:bg-slate-900"
          >
            <dt className="text-xs text-slate-500 dark:text-slate-400">{item.label}</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
