import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 py-24">
      <p className="text-2xl font-semibold">404 — ページが見つかりません</p>
      <Link
        to="/"
        className="text-zinc-700 underline underline-offset-4 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
      >
        ホームへ戻る
      </Link>
    </div>
  );
}
