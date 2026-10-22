import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, useRouteError } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AppLayout } from './components/AppLayout';
import { Callout, Spinner, TooltipProvider } from './components/ui';
import LandingPage from './pages/LandingPage';
import { ImprintPage, NotFoundPage, PrivacyPage } from './pages/StaticPages';
import i18n from './i18n';

// Map-heavy routes are split so the landing page stays light.
const CreateMemoryPage = lazy(() => import('./features/create/CreateMemoryPage'));
const PlacePage = lazy(() => import('./features/create/PlacePage'));
const EditorPage = lazy(() => import('./features/editor/EditorPage'));
const ExportPage = lazy(() => import('./features/export/ExportPage'));
const AccountPage = lazy(() => import('./features/account/AccountPage'));
const SharedPage = lazy(() => import('./features/share/SharedPage'));

const page = (node: ReactNode) => (
  <Suspense
    fallback={
      <div className="flex flex-1 items-center justify-center p-12">
        <Spinner label={i18n.t('editor.loading')} />
      </div>
    }
  >
    {node}
  </Suspense>
);

function RouteError() {
  const error = useRouteError();
  if (import.meta.env.DEV) console.error(error);
  return (
    <main id="main" className="mx-auto max-w-lg p-8">
      <Callout tone="error" title={i18n.t('errors.title')}>
        {i18n.t('errors.generic')}
      </Callout>
    </main>
  );
}

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'create', element: page(<CreateMemoryPage />) },
      { path: 'create/place', element: page(<PlacePage />) },
      { path: 'design/:id/export', element: page(<ExportPage />) },
      { path: 'account', element: page(<AccountPage />) },
      { path: 's/:token', element: page(<SharedPage />) },
      { path: 'privacy', element: <PrivacyPage /> },
      { path: 'imprint', element: <ImprintPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  // The editor is full-screen and has its own top bar.
  { path: 'design/:id', element: page(<EditorPage />), errorElement: <RouteError /> },
]);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true }, mutations: { retry: 0 } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
