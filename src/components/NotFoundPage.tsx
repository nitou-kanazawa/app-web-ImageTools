import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <p className="text-2xl font-semibold">404 — ページが見つかりません</p>
      <Link to="/" className="text-blue-600 hover:underline dark:text-blue-400">
        ツール一覧へ戻る
      </Link>
    </div>
  );
}
