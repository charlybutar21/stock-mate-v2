import { Calculator, Layers, LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { useI18n } from '@/client/i18n/useI18n';
import { useLogout, useMe } from '@/client/features/auth/useAuth';
import { Button, cn } from './primitives';

export function LanguageSwitcher() {
  const { lang, setLang } = useI18n();
  return (
    <div
      className="inline-flex items-center rounded-sm border border-border bg-surface p-0.5 font-mono text-[11px] font-medium"
      role="group"
      aria-label="Language switcher"
    >
      <button
        type="button"
        onClick={() => setLang('en')}
        className={cn(
          'rounded-xs px-2 py-0.5 transition-colors cursor-pointer',
          lang === 'en' ? 'bg-ink text-surface' : 'text-muted hover:text-ink',
        )}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang('id')}
        className={cn(
          'rounded-xs px-2 py-0.5 transition-colors cursor-pointer',
          lang === 'id' ? 'bg-ink text-surface' : 'text-muted hover:text-ink',
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
      <header className="sticky top-0 z-30 border-b border-border bg-panel">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex h-full items-center gap-7">
            <Link to="/watchlist" className="flex items-baseline gap-2 text-ink">
              <span className="font-display text-lg font-semibold tracking-tight">
                {t.appName}
              </span>
              <span className="hidden font-mono text-[10px] tracking-widest text-muted uppercase sm:inline">
                IDX DESK
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
                      'relative inline-flex h-full items-center gap-1.5 px-3 text-sm font-medium transition-colors',
                      active
                        ? 'text-ink after:absolute after:right-0 after:bottom-0 after:left-0 after:h-[2px] after:bg-brand-700'
                        : 'text-muted hover:text-ink',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
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
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t.nav.logout}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6">{children}</main>
    </div>
  );
}
