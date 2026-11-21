import { Calculator, Layers, LogOut, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { useI18n } from '@/client/i18n/useI18n';
import { useLogout, useMe } from '@/client/features/auth/useAuth';
import { Button, cn } from './primitives';

export function LanguageSwitcher() {
  const { lang, setLang } = useI18n();
  return (
    <div
      className="inline-flex items-center rounded-lg border border-border bg-subtle p-0.5 text-xs font-medium"
      role="group"
      aria-label="Language switcher"
    >
      <button
        type="button"
        onClick={() => setLang('en')}
        className={cn(
          'rounded-md px-2 py-1 transition-colors cursor-pointer',
          lang === 'en' ? 'bg-panel text-ink shadow-xs' : 'text-muted hover:text-ink',
        )}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang('id')}
        className={cn(
          'rounded-md px-2 py-1 transition-colors cursor-pointer',
          lang === 'id' ? 'bg-panel text-ink shadow-xs' : 'text-muted hover:text-ink',
        )}
      >
        ID
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const location = useLocation();
  const { data: user } = useMe();
  const logout = useLogout();

  const navItems = [
    { to: '/watchlist', label: t.nav.watchlist, icon: Layers },
    { to: '/simulator', label: t.nav.simulator, icon: Calculator },
  ];

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-30 border-b border-border bg-panel/95 backdrop-blur-xs">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link to="/watchlist" className="flex items-center gap-2 font-semibold text-ink">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white">
                <TrendingUp className="h-4 w-4" />
              </span>
              <span className="text-sm tracking-tight">{t.appName}</span>
            </Link>

            <nav className="flex items-center gap-1" aria-label="Main navigation">
              {navItems.map((item) => {
                const active = location.pathname.startsWith(item.to);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                      active
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-muted hover:bg-subtle hover:text-ink',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            {user && (
              <div className="hidden items-center gap-2 border-l border-border pl-3 sm:flex">
                <span className="max-w-[140px] truncate text-xs font-medium text-muted">
                  {user.name}
                </span>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              aria-label={t.nav.logout}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">{t.nav.logout}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
