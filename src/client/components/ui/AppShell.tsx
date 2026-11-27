import { Calculator, LogOut, Moon, Radar, Star, Sun, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { useI18n } from '@/client/i18n/useI18n';
import { useLogout, useMe } from '@/client/features/auth/useAuth';
import { useTheme } from '@/client/lib/useTheme';
import { Button, cn } from './primitives';

export function ThemeSwitcher() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useI18n();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? t.nav.switchToLight : t.nav.switchToDark}
      aria-label={isDark ? t.nav.switchToLight : t.nav.switchToDark}
      aria-pressed={isDark}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-xs font-semibold text-ink transition-colors hover:border-brand-600/50 hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 cursor-pointer"
    >
      {isDark ? (
        <>
          <Sun className="h-3.5 w-3.5 text-warning-600" aria-hidden="true" />
          <span className="hidden sm:inline">{t.nav.lightMode}</span>
        </>
      ) : (
        <>
          <Moon className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
          <span className="hidden sm:inline">{t.nav.darkMode}</span>
        </>
      )}
    </button>
  );
}

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
          lang === 'en' ? 'bg-brand-solid text-white shadow-2xs' : 'text-muted hover:text-ink',
        )}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang('id')}
        className={cn(
          'rounded-md px-2.5 py-1 transition-all cursor-pointer',
          lang === 'id' ? 'bg-brand-solid text-white shadow-2xs' : 'text-muted hover:text-ink',
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
    { to: '/radar', label: t.nav.radar, icon: Radar },
    { to: '/simulator', label: t.nav.simulator, icon: Calculator },
  ];

  const initials = (user?.name ?? 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

  return (
    <div className="min-h-screen bg-surface text-ink transition-colors duration-150">
      <header className="sticky top-0 z-30 border-b border-border bg-panel">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex h-full items-center gap-4 sm:gap-6">
            <Link to="/watchlist" className="flex items-center gap-2 text-ink">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-solid text-white shadow-2xs">
                <TrendingUp className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="font-display text-base font-bold tracking-tight text-ink sm:text-lg">
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
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative inline-flex h-full items-center gap-1.5 px-2.5 text-xs font-semibold transition-colors sm:px-3.5 sm:text-sm',
                      active
                        ? 'text-brand-700 after:absolute after:right-2 after:bottom-0 after:left-2 after:h-[2.5px] after:rounded-t-full after:bg-brand-600'
                        : 'text-muted hover:text-ink',
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5">
            <ThemeSwitcher />
            <LanguageSwitcher />
            {user && (
              <div className="hidden items-center gap-2 border-l border-border pl-2.5 md:flex">
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-brand-600/25 bg-brand-50 text-xs font-bold text-brand-700">
                  {initials}
                </span>
                <span className="max-w-[120px] truncate text-xs font-medium text-ink">
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
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t.nav.logout}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-6 pb-12 sm:px-6">{children}</main>
    </div>
  );
}
