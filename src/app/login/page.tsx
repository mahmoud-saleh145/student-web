'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';

import { BrandLogo } from '@/components/brand/BrandLogo';
import { Button, Card } from '@/components/ui/core';
import { InlineError } from '@/components/ui/feedback';
import { Input, PasswordInput } from '@/components/ui/forms';
import { CheckIcon } from '@/components/ui/icons';
import { loginSchema, type LoginInput } from '@/features/schemas';
import { ApiError, asApiError } from '@/lib/api-client';
import { useSession, useTranslation } from '@/lib/session-context';
import { WEB_REQUEST_HEADER } from '@/lib/web-request';
import { safeNextPath } from '@/lib/route-guard';
import { useLanguageStore } from '@/store/stores';

const TAGLINE_KEY = 'search.idle.body';
const HIGHLIGHT_KEYS = ['home.newCourses', 'library.browseSubtitle', 'auth.deviceNoticeTitle', 'support.title'];

export default function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { refresh, status } = useSession();
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const language = useLanguageStore((s) => s.language);
  const [formError, setFormError] = React.useState<ApiError | null>(null);

  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phone: '', password: '' },
    mode: 'onBlur',
  });

  // Where to go after signing in, and why the previous session ended — the
  // mobile login screen shows that reason too (`lastSessionError`). Read from
  // `location` rather than `useSearchParams` so the page stays statically
  // renderable.
  const [nextPath, setNextPath] = React.useState<string>('/home');
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNextPath(safeNextPath(params.get('next')) ?? '/home');
    const reason = params.get('reason');
    if (reason && /^[A-Z_]{3,40}$/.test(reason)) {
      setFormError(new ApiError({ code: reason as ApiError['code'], status: 401, message: '' }));
    }
  }, []);

  React.useEffect(() => {
    if (status === 'authenticated') router.replace(nextPath);
  }, [status, router, nextPath]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const parsed = loginSchema.parse(values);
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', [WEB_REQUEST_HEADER]: '1' },
        credentials: 'same-origin',
        body: JSON.stringify(parsed),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new ApiError({
          code: (body?.code ?? body?.error?.code ?? 'UNKNOWN') as ApiError['code'],
          status: res.status,
          message: body?.message ?? body?.error?.message ?? '',
          errors: body?.errors ?? body?.error?.fields,
        });
      }
      await refresh();
      router.replace(nextPath);
    } catch (e) {
      setFormError(asApiError(e));
    }
  });

  const tr = (key: string) => {
    const v = t(key);
    return v === key ? undefined : v;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="grid min-h-screen lg:grid-cols-2">
        <aside className="relative hidden overflow-hidden bg-primary p-10 text-primary-fg lg:flex lg:flex-col lg:justify-between xl:p-14">

          <div className="relative">
            <div className="flex items-center gap-2.5">
              <BrandLogo height={30} />
            </div>
            <p className="mt-14 max-w-sm text-[28px] font-bold leading-tight tracking-tight">{t(TAGLINE_KEY)}</p>
            <p className="mt-3 max-w-sm text-sm text-primary-fg">{t('auth.loginSubtitle')}</p>
          </div>

          <ul className="relative mt-12 space-y-3">
            {HIGHLIGHT_KEYS.map((key) => (
              <li key={key} className="flex items-start gap-2.5 text-[13px] font-medium text-primary-fg">
                <span className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-md bg-highlight-fg text-highlight">
                  <CheckIcon size={13} />
                </span>
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </aside>

        <main className="flex flex-col px-5 py-6 sm:px-8 lg:py-8">
          <div className="flex justify-end">
            <button
              onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
              aria-label={t('nav.language')}
              className="h-9 cursor-pointer rounded-lg border border-border px-3 text-[13px] font-semibold text-muted transition-colors hover:bg-surface-alt hover:text-foreground"
            >
              {language === 'ar' ? 'English' : 'العربية'}
            </button>
          </div>

          <div className="flex flex-1 items-center justify-center py-8">
            <div className="mx-auto w-full max-w-sm">
              <Card>
                <div className="flex items-center gap-2.5">
                  <BrandLogo height={30} />
                </div>

                <h1 className="mt-6 text-2xl font-bold tracking-tight">{t('auth.welcomeBack')}</h1>
                <p className="mt-1 text-sm text-muted">{t('auth.loginSubtitle')}</p>

                {formError ? <div className="mt-5"><InlineError error={formError} /></div> : null}

                <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4">
                  <Controller
                    control={control}
                    name="phone"
                    render={({ field }) => (
                      <Input
                        label={t('auth.phone')}
                        placeholder={t('auth.phonePlaceholder')}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        error={tr(errors.phone?.message ?? '')}
                        inputMode="tel"
                        autoComplete="tel"
                        dir="ltr"
                      />
                    )}
                  />
                  <Controller
                    control={control}
                    name="password"
                    render={({ field }) => (
                      <PasswordInput
                        label={t('auth.password')}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        error={tr(errors.password?.message ?? '')}
                      />
                    )}
                  />
                  <div className="flex justify-end">
                    <Link href="/password-help" className="text-[13px] font-semibold text-primary-ink underline-offset-4 hover:underline">
                      {t('auth.forgotPassword')}
                    </Link>
                  </div>
                  <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
                    {isSubmitting ? t('auth.loggingIn') : t('auth.login')}
                  </Button>
                </form>
              </Card>

              <p className="mt-6 text-center text-sm text-muted">
                {t('auth.noAccount')}{' '}
                <Link href="/register" className="font-semibold text-primary-ink underline-offset-4 hover:underline">
                  {t('auth.createAccount')}
                </Link>
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}