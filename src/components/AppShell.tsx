import { useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { tools } from '../tools/registry';
import { StatusBarContext, type StatusItem } from '../lib/statusBar';
import { THEME_LABELS, nextTheme } from '../lib/theme';
import { useTheme } from '../lib/useTheme';

/**
 * VS Code 風のアプリ全体レイアウト。
 * 上: タイトルバー / 左: サイドバー（ツール一覧） / 中央: コンテンツ / 下: ステータスバー。
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [statusItems, setStatusItems] = useState<StatusItem[]>([]);
  const location = useLocation();
  const { theme, cycleTheme } = useTheme();

  const activeTool = useMemo(() => {
    const match = location.pathname.match(/^\/tools\/([^/]+)/);
    return match ? tools.find((t) => t.meta.slug === match[1]) : undefined;
  }, [location.pathname]);

  const visibleTools = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter(
      ({ meta }) =>
        meta.title.toLowerCase().includes(q) ||
        meta.description.toLowerCase().includes(q) ||
        (meta.tags ?? []).some((t) => t.toLowerCase().includes(q)),
    );
  }, [filter]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 text-slate-900 dark:bg-[#1e1e1e] dark:text-slate-200">
      {/* タイトルバー */}
      <header className="relative flex h-9 shrink-0 items-center gap-2 border-b border-slate-300 bg-slate-200 px-2 text-sm dark:border-black/40 dark:bg-[#323233]">
        <button
          type="button"
          aria-label="サイドバーを開閉"
          onClick={() => setSidebarOpen((v) => !v)}
          className="rounded px-2 py-0.5 hover:bg-slate-300 md:hidden dark:hover:bg-white/10"
        >
          ☰
        </button>
        <Link
          to="/"
          className="flex items-center gap-1.5 rounded px-1.5 py-0.5 font-medium hover:bg-slate-300 dark:hover:bg-white/10"
        >
          <span aria-hidden>🧰</span>
          <span>Web MiniTools</span>
        </Link>
        <div className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 text-xs text-slate-500 sm:block dark:text-slate-400">
          {activeTool ? `${activeTool.meta.title} — Web MiniTools` : 'Web MiniTools'}
        </div>
        <button
          type="button"
          onClick={cycleTheme}
          aria-label="テーマを切り替え"
          title={`テーマ: ${THEME_LABELS[theme].label}（クリックで${THEME_LABELS[nextTheme(theme)].label}へ）`}
          className="ml-auto flex items-center gap-1.5 rounded px-2 py-0.5 text-xs hover:bg-slate-300 dark:hover:bg-white/10"
        >
          <span aria-hidden>{THEME_LABELS[theme].icon}</span>
          <span className="hidden sm:inline">{THEME_LABELS[theme].label}</span>
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* サイドバー */}
        <aside
          className={`absolute inset-y-0 left-0 z-20 w-64 shrink-0 flex-col border-r border-slate-300 bg-slate-100 md:static md:flex dark:border-black/40 dark:bg-[#252526] ${
            sidebarOpen ? 'flex' : 'hidden'
          }`}
        >
          <div className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            ツール
            <span className="ml-2 rounded-full bg-slate-300 px-1.5 text-[10px] tabular-nums text-slate-600 dark:bg-white/10 dark:text-slate-300">
              {tools.length}
            </span>
          </div>
          <div className="px-3 pb-2">
            <input
              type="search"
              aria-label="ツールを検索"
              placeholder="検索..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-blue-500 dark:border-black/40 dark:bg-[#3c3c3c] dark:text-slate-200 dark:placeholder:text-slate-500"
            />
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto pb-2">
            {visibleTools.length === 0 ? (
              <p className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                該当するツールがありません
              </p>
            ) : (
              <ul>
                {visibleTools.map(({ meta }) => (
                  <li key={meta.slug}>
                    <NavLink
                      to={`/tools/${meta.slug}`}
                      onClick={() => setSidebarOpen(false)}
                      title={meta.description}
                      className={({ isActive }) =>
                        `flex items-center gap-2 border-l-2 px-3 py-1.5 text-[13px] ${
                          isActive
                            ? 'border-blue-500 bg-slate-200 text-slate-900 dark:bg-[#37373d] dark:text-white'
                            : 'border-transparent text-slate-700 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-[#2a2d2e]'
                        }`
                      }
                    >
                      <span aria-hidden className="w-5 text-center">
                        {meta.icon ?? '🧩'}
                      </span>
                      <span className="truncate">{meta.title}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            )}
          </nav>
          <div className="border-t border-slate-300 px-4 py-2 text-[11px] text-slate-500 dark:border-black/40 dark:text-slate-500">
            すべてブラウザ内で処理されます
          </div>
        </aside>
        {/* モバイルでサイドバー表示中の背景 */}
        {sidebarOpen && (
          <button
            type="button"
            aria-label="サイドバーを閉じる"
            onClick={() => setSidebarOpen(false)}
            className="absolute inset-0 z-10 bg-black/30 md:hidden"
          />
        )}

        {/* コンテンツ */}
        <main className="min-w-0 flex-1 overflow-y-auto">
          <StatusBarContext.Provider value={setStatusItems}>{children}</StatusBarContext.Provider>
        </main>
      </div>

      {/* ステータスバー */}
      <footer className="flex h-6 shrink-0 items-center gap-1 overflow-hidden bg-[#007acc] px-2 text-[11px] text-white">
        <span className="flex items-center gap-1 rounded px-1.5 hover:bg-white/15">
          <span aria-hidden>⚡</span>
          {activeTool ? activeTool.meta.title : '準備完了'}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {statusItems.map((item) => (
            <span
              key={item.key}
              title={item.title}
              data-testid={`status-${item.key}`}
              className="rounded px-1.5 tabular-nums hover:bg-white/15"
            >
              {item.text}
            </span>
          ))}
        </div>
      </footer>
    </div>
  );
}
