import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { tools } from '../tools/registry';
import { StatusBarContext, type StatusItem } from '../lib/statusBar';
import { THEME_LABELS, nextTheme } from '../lib/theme';
import { useTheme } from '../lib/useTheme';
import { Icon } from './icons';

const SIDEBAR_STORAGE_KEY = 'wmt-sidebar-collapsed';

/**
 * アプリ全体レイアウト（VS Code 風の構成 × モノトーンのトーン）。
 * 上: タイトルバー / 左: サイドバー（ツール一覧） / 中央: コンテンツ / 下: ステータスバー。
 */
export function AppShell({ children }: { children: ReactNode }) {
  // モバイル: オーバーレイ表示の開閉 / デスクトップ: 折りたたみ（保存される）
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [filter, setFilter] = useState('');
  const [statusItems, setStatusItems] = useState<StatusItem[]>([]);
  const location = useLocation();
  const { theme, cycleTheme } = useTheme();

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      // 保存できない環境でも動作は続行する
    }
  }, [collapsed]);

  const toggleSidebar = useCallback(() => {
    // md 以上では折りたたみ、モバイルではオーバーレイの開閉
    if (window.matchMedia('(min-width: 768px)').matches) {
      setCollapsed((v) => !v);
    } else {
      setSidebarOpen((v) => !v);
    }
  }, []);

  // VS Code と同じく Ctrl+B（macOS は Cmd+B）で開閉
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [toggleSidebar]);

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
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-100 text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-200">
      {/* タイトルバー */}
      <header className="relative flex h-10 shrink-0 items-center gap-2 border-b border-zinc-300 bg-zinc-50 px-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <button
          type="button"
          aria-label="サイドバーを開閉"
          title="サイドバーを開閉 (Ctrl+B)"
          onClick={toggleSidebar}
          className="rounded p-1.5 text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-white/10"
        >
          <Icon name="panel-left" size={16} />
        </button>
        <Link
          to="/"
          className="flex items-center gap-2 rounded px-2 py-1 hover:bg-zinc-200 dark:hover:bg-white/10"
        >
          <Icon name="grid" size={15} className="text-zinc-700 dark:text-zinc-300" />
          <span className="text-[13px] font-semibold uppercase tracking-[0.18em]">
            Web MiniTools
          </span>
        </Link>
        <div className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 text-xs text-zinc-500 sm:block dark:text-zinc-500">
          {activeTool ? activeTool.meta.title : ''}
        </div>
        <button
          type="button"
          onClick={cycleTheme}
          aria-label="テーマを切り替え"
          title={`テーマ: ${THEME_LABELS[theme].label}（クリックで${THEME_LABELS[nextTheme(theme)].label}へ）`}
          className="ml-auto flex items-center gap-1.5 rounded px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-white/10"
        >
          <Icon name={THEME_LABELS[theme].icon} size={14} />
          <span className="hidden sm:inline">{THEME_LABELS[theme].label}</span>
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* サイドバー */}
        <aside
          className={`absolute inset-y-0 left-0 z-20 w-64 shrink-0 flex-col overflow-hidden border-r border-zinc-300 bg-zinc-50 md:static md:flex md:transition-[width,visibility,border-color] md:duration-200 dark:border-zinc-800 dark:bg-zinc-900 ${
            sidebarOpen ? 'flex' : 'hidden'
          } ${
            collapsed
              ? 'md:invisible md:w-0 md:border-transparent dark:md:border-transparent'
              : 'md:w-64'
          }`}
        >
          {/* 幅アニメーション中に中身が潰れないよう内側は固定幅にする */}
          <div className="flex h-full w-64 shrink-0 flex-col">
            <div className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
              ツール
              <span className="ml-2 rounded-full bg-zinc-200 px-1.5 text-[10px] tabular-nums text-zinc-600 dark:bg-white/10 dark:text-zinc-400">
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
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500"
              />
            </div>
            <nav className="min-h-0 flex-1 overflow-y-auto pb-2">
              {visibleTools.length === 0 ? (
                <p className="px-4 py-2 text-xs text-zinc-500 dark:text-zinc-500">
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
                          `flex items-center gap-2.5 border-l-2 px-3 py-1.5 text-[13px] ${
                            isActive
                              ? 'border-zinc-900 bg-zinc-200 font-medium text-zinc-900 dark:border-zinc-100 dark:bg-zinc-800 dark:text-zinc-50'
                              : 'border-transparent text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-200'
                          }`
                        }
                      >
                        <Icon name={meta.icon ?? 'box'} size={14} className="shrink-0" />
                        <span className="truncate">{meta.title}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              )}
            </nav>
            <div className="border-t border-zinc-300 px-4 py-2 text-[11px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-600">
              すべてブラウザ内で処理されます
            </div>
          </div>
        </aside>
        {/* モバイルでサイドバー表示中の背景 */}
        {sidebarOpen && (
          <button
            type="button"
            aria-label="サイドバーを閉じる"
            onClick={() => setSidebarOpen(false)}
            className="absolute inset-0 z-10 bg-black/40 md:hidden"
          />
        )}

        {/* コンテンツ */}
        <main className="min-w-0 flex-1 overflow-y-auto">
          <StatusBarContext.Provider value={setStatusItems}>{children}</StatusBarContext.Provider>
        </main>
      </div>

      {/* ステータスバー */}
      <footer className="flex h-6 shrink-0 items-center gap-1 overflow-hidden border-t border-zinc-800 bg-zinc-900 px-2 text-[11px] text-zinc-300 dark:bg-zinc-950 dark:text-zinc-400">
        <span className="rounded px-1.5 tracking-wide">
          {activeTool ? activeTool.meta.title : '準備完了'}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {statusItems.map((item) => (
            <span
              key={item.key}
              title={item.title}
              data-testid={`status-${item.key}`}
              className="rounded px-1.5 tabular-nums hover:bg-white/10"
            >
              {item.text}
            </span>
          ))}
        </div>
      </footer>
    </div>
  );
}
