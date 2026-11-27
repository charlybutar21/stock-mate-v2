import { ArrowLeft, Shield, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { LanguageSwitcher, ThemeSwitcher } from '@/client/components/ui/AppShell';
import { Card } from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';

function LegalShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-surface px-4 py-8 text-ink sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/watchlist"
            className="inline-flex items-center gap-2 text-sm font-semibold text-ink hover:text-brand-700"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-solid text-white shadow-2xs">
              <TrendingUp className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="font-display text-lg font-bold tracking-tight">{t.appName}</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeSwitcher />
            <LanguageSwitcher />
          </div>
        </div>

        <Link
          to="/watchlist"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {t.legal.backToApp}
        </Link>

        <Card variant="default" className="space-y-6 p-6 sm:p-8">
          <div className="border-b border-border pb-4">
            <div className="flex items-center gap-2 text-brand-700">
              <Shield className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-wide">
                {t.legal.lastUpdated}
              </span>
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">
              {title}
            </h1>
            <p className="mt-1 text-sm text-muted">{subtitle}</p>
          </div>

          <div className="space-y-5 text-sm leading-relaxed text-ink/90">{children}</div>
        </Card>

        <div className="flex items-center justify-center gap-3 text-xs text-muted">
          <Link to="/terms" className="hover:text-brand-700 hover:underline">
            {t.common.termsLink}
          </Link>
          <span aria-hidden="true">·</span>
          <Link to="/privacy" className="hover:text-brand-700 hover:underline">
            {t.common.privacyLink}
          </Link>
        </div>
      </div>
    </div>
  );
}

export function TermsPage() {
  const { t } = useI18n();
  const s = t.legal.termsSections;

  return (
    <LegalShell title={t.legal.termsTitle} subtitle={t.legal.termsSubtitle}>
      <section className="space-y-1.5">
        <h2 className="font-display text-base font-bold text-ink">{s.nonAdvisoryTitle}</h2>
        <p className="text-muted">{s.nonAdvisoryBody}</p>
      </section>
      <section className="space-y-1.5">
        <h2 className="font-display text-base font-bold text-ink">{s.dataAccuracyTitle}</h2>
        <p className="text-muted">{s.dataAccuracyBody}</p>
      </section>
      <section className="space-y-1.5">
        <h2 className="font-display text-base font-bold text-ink">{s.userResponsibilityTitle}</h2>
        <p className="text-muted">{s.userResponsibilityBody}</p>
      </section>
    </LegalShell>
  );
}

export function PrivacyPage() {
  const { t } = useI18n();
  const s = t.legal.privacySections;

  return (
    <LegalShell title={t.legal.privacyTitle} subtitle={t.legal.privacySubtitle}>
      <section className="space-y-1.5">
        <h2 className="font-display text-base font-bold text-ink">{s.dataCollectedTitle}</h2>
        <p className="text-muted">{s.dataCollectedBody}</p>
      </section>
      <section className="space-y-1.5">
        <h2 className="font-display text-base font-bold text-ink">{s.storageSecurityTitle}</h2>
        <p className="text-muted">{s.storageSecurityBody}</p>
      </section>
      <section className="space-y-1.5">
        <h2 className="font-display text-base font-bold text-ink">{s.userRightsTitle}</h2>
        <p className="text-muted">{s.userRightsBody}</p>
      </section>
    </LegalShell>
  );
}
