import { Calculator, LogOut, Star, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { useI18n } from '@/client/i18n/useI18n';
import { useLogout, useMe } from '@/client/features/auth/useAuth';
import { Button, cn } from './primitives';

export function LanguageSwitcher() {
  const { lang, setLang } = useI18n();
  return (
    <div
      className="inline-flex items-center rounded-lg border border-border bg-surface p-0.5 text-xs font-semibold"
      role="group"
      aria-label="Language switcher"
    >
      <button
        type="button"
        onClick={() => setLang('en')}
        className={cn(
          'rounded-md px-2.5 py-1 transition-all cursor-pointer',
          lang === 'en' ? 'bg-brand-600 text-white shadow-2xs' : 'text-muted hover:text-ink',
        )}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang('id')}
        className={cn(
          'rounded-md px-2.5 py-1 transition-all cursor-pointer',
          lang === 'id' ? 'bg-brand-600 text-white shadow-2xs' : 'text-muted hover:text-ink',
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
    { to: '/watchlist', label: t.nav.watchlist, icon: Star },
    { to: '/simulator', label: t.nav.simulator, icon: Calculator },
  ];

  const initials = (user?.name ?? 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

  return (
    <div className="min-h-screen bg-surface">
      {/* Stockbit-Inspired Clean Dual-Zone Top Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-panel">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex h-full items-center gap-6">
            <Link to="/watchlist" className="flex items-center gap-2 text-ink">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-2xs">
                <TrendingUp className="h-4 w-4" />
              </span>
              <span className="font-display text-lg font-bold tracking-tight text-ink">
                {t.appName}
              </span>
            </Link>

            <nav className="flex h-full items-center gap-1" aria-label="Main navigation">
              {navItems.map((item) => {
                const active = location.pathname.startsWith(item.to);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      'relative inline-flex h-full items-center gap-1.5 px-3.5 text-sm font-semibold transition-colors',
                      active
                        ? 'text-brand-600 after:absolute after:right-2 after:bottom-0 after:left-2 after:h-[2.5px] after:rounded-t-full after:bg-brand-600'
                        : 'text-muted hover:text-ink',
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
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700 border border-brand-600/20">
                  {initials}
                </span>
                <span className="max-w-[130px] truncate text-xs font-medium text-ink">
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
