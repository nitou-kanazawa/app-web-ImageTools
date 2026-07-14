import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 py-24">
      <p className="text-2xl font-semibold">404 — ページが見つかりません</p>
      <Link to="/" className="text-blue-600 hover:underline dark:text-blue-400">
        ホームへ戻る
      </Link>
    </div>
  );
}
