import { Link } from 'react-router-dom';
import { tools } from '../tools/registry';

export function HomePage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight">Web MiniTools</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">ブラウザで動く小さなツール集。</p>
        </header>

        {tools.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-700">
            まだツールがありません。<code>src/tools/</code> に追加してください。
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {tools.map(({ meta }) => (
              <li key={meta.slug}>
                <Link
                  to={`/tools/${meta.slug}`}
                  className="block h-full rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
                >
                  <h2 className="text-lg font-semibold">{meta.title}</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {meta.description}
                  </p>
                  {meta.tags && meta.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {meta.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
