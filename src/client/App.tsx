import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/ui/AppShell';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { Skeleton } from './components/ui/primitives';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { useMe } from './features/auth/useAuth';
import { RadarPage } from './features/radar/RadarPage';
import { SimulatorPage } from './features/simulator/SimulatorPage';
import { StockDetailPage } from './features/watchlist/StockDetailPage';
import { WatchlistPage } from './features/watchlist/WatchlistPage';
import { I18nProvider } from './i18n/useI18n';
import { CalcModeProvider } from './lib/useCalcMode';
import { PrivacyProvider } from './lib/usePrivacy';
import { ThemeProvider } from './lib/useTheme';

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
  return <AppShell>{children}</AppShell>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useMe();
  if (isLoading) return <FullPageSkeleton />;
  if (user) return <Navigate to="/watchlist" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <I18nProvider>
            <PrivacyProvider>
              <CalcModeProvider>
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
              </CalcModeProvider>
            </PrivacyProvider>
          </I18nProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
