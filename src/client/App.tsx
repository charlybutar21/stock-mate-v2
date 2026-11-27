import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/ui/AppShell';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { Skeleton } from './components/ui/primitives';
import { useMe } from './features/auth/useAuth';
import { I18nProvider } from './i18n/useI18n';
import { CalcModeProvider } from './lib/useCalcMode';
import { PrivacyProvider } from './lib/usePrivacy';
import { ThemeProvider } from './lib/useTheme';
import { ToastProvider } from './lib/useToast';

const LoginPage = lazy(() =>
  import('./features/auth/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const RegisterPage = lazy(() =>
  import('./features/auth/RegisterPage').then((m) => ({ default: m.RegisterPage })),
);
const WatchlistPage = lazy(() =>
  import('./features/watchlist/WatchlistPage').then((m) => ({ default: m.WatchlistPage })),
);
const StockDetailPage = lazy(() =>
  import('./features/watchlist/StockDetailPage').then((m) => ({ default: m.StockDetailPage })),
);
const RadarPage = lazy(() =>
  import('./features/radar/RadarPage').then((m) => ({ default: m.RadarPage })),
);
const SimulatorPage = lazy(() =>
  import('./features/simulator/SimulatorPage').then((m) => ({ default: m.SimulatorPage })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function FullPageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useMe();
  if (isLoading) return <FullPageSkeleton />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <AppShell>
      <Suspense fallback={<FullPageSkeleton />}>{children}</Suspense>
    </AppShell>
  );
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useMe();
  if (isLoading) return <FullPageSkeleton />;
  if (user) return <Navigate to="/watchlist" replace />;
  return <Suspense fallback={<FullPageSkeleton />}>{children}</Suspense>;
}

export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <I18nProvider>
            <PrivacyProvider>
              <CalcModeProvider>
                <ToastProvider>
                  <BrowserRouter>
                  <Routes>
                    <Route
                      path="/login"
                      element={
                        <GuestOnly>
                          <LoginPage />
                        </GuestOnly>
                      }
                    />
                    <Route
                      path="/register"
                      element={
                        <GuestOnly>
                          <RegisterPage />
                        </GuestOnly>
                      }
                    />
                    <Route
                      path="/watchlist"
                      element={
                        <RequireAuth>
                          <WatchlistPage />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="/watchlist/:id"
                      element={
                        <RequireAuth>
                          <StockDetailPage />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="/radar"
                      element={
                        <RequireAuth>
                          <RadarPage />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="/simulator"
                      element={
                        <RequireAuth>
                          <SimulatorPage />
                        </RequireAuth>
                      }
                    />
                    <Route path="*" element={<Navigate to="/watchlist" replace />} />
                  </Routes>
                  </BrowserRouter>
                </ToastProvider>
              </CalcModeProvider>
            </PrivacyProvider>
          </I18nProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
