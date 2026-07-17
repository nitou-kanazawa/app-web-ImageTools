import { Link } from 'react-router-dom';
import { tools } from '../tools/registry';
import { Icon } from './icons';

/** VS Code のウェルカムタブ風のホーム画面。 */
export function HomePage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-light tracking-tight">Web MiniTools</h1>
        <p className="mt-1 text-zinc-500 dark:text-zinc-400">
          ブラウザで動く画像・テキストの小さなツール集
        </p>
      </header>

      {tools.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700">
          まだツールがありません。<code>src/tools/</code> に追加してください。
        </p>
      ) : (
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            開始
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {tools.map(({ meta }) => (
              <li key={meta.slug}>
                <Link
                  to={`/tools/${meta.slug}`}
                  className="flex h-full items-start gap-3.5 rounded-lg border border-zinc-200 bg-white p-4 transition hover:border-zinc-500 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-500"
                >
                  <span
                    aria-hidden
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    <Icon name={meta.icon ?? 'box'} size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{meta.title}</span>
                    <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                      {meta.description}
                    </span>
                    {meta.tags && meta.tags.length > 0 && (
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        {meta.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-600 dark:bg-white/10 dark:text-zinc-400"
                          >
                            {tag}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-xs text-zinc-500 dark:text-zinc-500">
            画像はすべてブラウザ内で処理され、サーバへ送信されません。AI
            機能は初回にモデルをダウンロードします（以降はキャッシュされます）。
          </p>
        </>
      )}
    </div>
  );
}
