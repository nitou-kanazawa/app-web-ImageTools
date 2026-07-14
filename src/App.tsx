import { Routes, Route } from 'react-router-dom';
import { tools } from './tools/registry';
import { AppShell } from './components/AppShell';
import { HomePage } from './components/HomePage';
import { ToolPage } from './components/ToolPage';
import { NotFoundPage } from './components/NotFoundPage';

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        {tools.map(({ meta, Component }) => (
          <Route
            key={meta.slug}
            path={`/tools/${meta.slug}`}
            element={
              <ToolPage meta={meta}>
                <Component />
              </ToolPage>
            }
          />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}
