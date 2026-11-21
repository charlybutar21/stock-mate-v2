import { TrendingUp } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { loginRequestSchema } from '@/shared/contracts';
import { LanguageSwitcher } from '@/client/components/ui/AppShell';
import { Button, Card, Field, Input } from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';
import { ApiClientError } from '@/client/lib/apiClient';
import { useLogin } from './useAuth';

export function LoginPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const login = useLogin();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);

    const parsed = loginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      const flat = z.flattenError(parsed.error);
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(flat.fieldErrors)) {
        if (v?.[0]) next[k] = v[0];
      }
      setFieldErrors(next);
      return;
    }

    try {
      await login.mutateAsync(parsed.data);
      navigate('/watchlist', { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFormError(err.message);
      } else {
        setFormError(t.common.unexpectedError);
      }
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-4 py-10">
      <div className="mb-6 flex w-full max-w-md items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <TrendingUp className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-ink">{t.appName}</span>
        </div>
        <LanguageSwitcher />
      </div>

      <Card className="w-full max-w-md p-6">
        <h1 className="text-lg font-semibold tracking-tight text-ink">{t.auth.loginTitle}</h1>
        <p className="mt-1 text-sm text-muted">{t.auth.loginSubtitle}</p>

        {formError && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-negative-600/20 bg-negative-50 px-3 py-2 text-xs text-negative-700"
          >
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
          <Field label={t.auth.emailLabel} htmlFor="login-email" error={fieldErrors.email}>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder={t.auth.emailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          <Field label={t.auth.passwordLabel} htmlFor="login-password" error={fieldErrors.password}>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              placeholder={t.auth.passwordPlaceholder}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          <Button type="submit" className="w-full" size="lg" disabled={login.isPending}>
            {login.isPending ? t.auth.signingIn : t.auth.signInBtn}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-muted">
          {t.auth.noAccount}{' '}
          <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700">
            {t.auth.goRegister}
          </Link>
        </p>
      </Card>
    </div>
  );
}
