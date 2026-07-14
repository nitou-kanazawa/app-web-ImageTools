import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ToolMeta } from '../tools/types';

interface ToolPageProps {
  meta: ToolMeta;
  children: ReactNode;
}

export function ToolPage({ meta, children }: ToolPageProps) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <nav className="mb-6 text-sm">
          <Link to="/" className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-100">
            ← ツール一覧
          </Link>
        </nav>
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">{meta.title}</h1>
          <p className="mt-1 text-slate-600 dark:text-slate-400">{meta.description}</p>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
