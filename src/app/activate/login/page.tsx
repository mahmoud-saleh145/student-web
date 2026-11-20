'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';

import { activationAuthFetch } from '@/activation/lib/client';
import { activationRoutes, safeActivationNext } from '@/activation/lib/routes';
import { useActivationSession } from '@/activation/session';
import { activationErrorMessage, useActivationT } from '@/activation/use-t';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { Button, Card } from '@/components/ui/core';
import { Input, PasswordInput } from '@/components/ui/forms';
import { AlertIcon, CheckIcon, ShieldIcon } from '@/components/ui/icons';
import { loginSchema, type LoginInput } from '@/features/schemas';
import { ApiError, asApiError } from '@/lib/api-client';
import { useLanguageStore } from '@/store/stores';

const POINT_KEYS = ['act.login.point.activate', 'act.login.point.library', 'act.login.point.app'];

/**
 * The portal's sign-in.
 *
 * The same Student Center account as the app — phone number and password,
 * validated by the same schema as the learning website's sign-in — posted to
 * the portal's own auth route, which signs in without a device identity (see
 * `api/activate/auth/login/route.ts`).
 *
 * There is no registration and no password reset here: accounts are created
 * in the app, and passwords are reset by the administration. After signing in
 * the student lands on a portal page; `next` is honoured only when it points
 * inside `/activate`.
 */
export default function ActivationLoginPage() {
  const { t, language } = useActivationT();
  const { status } = useActivationSession();
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const [formError, setFormError] = React.useState<ApiError | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phone: '', password: '' },
    mode: 'onBlur',
  });

  // Read from `location` rather than `useSearchParams` so the page stays
  // statically renderable, as the learning website's sign-in does.
  const [nextPath, setNextPath] = React.useState<string>(activationRoutes.home);
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNextPath(safeActivationNext(params.get('next')) ?? activationRoutes.home);
    const reason = params.get('reason');
    if (reason && /^[A-Z_]{3,40}$/.test(reason)) {
      setFormError(new ApiError({ code: reason as ApiError['code'], status: 401, message: '' }));
    }
  }, []);

  // A full navigation, so the server renders the destination with the new
  // session and nothing cached while signed out carries over.
  React.useEffect(() => {
    if (status === 'authenticated') window.location.replace(nextPath);
  }, [status, nextPath]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const parsed = loginSchema.parse(values);
      const res = await activationAuthFetch('login', parsed);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new ApiError({
          code: (body?.code ?? body?.error?.code ?? 'UNKNOWN') as ApiError['code'],
          status: res.status,
          message: '',
          errors: body?.errors ?? body?.error?.fields,
        });
      }
      window.location.replace(nextPath);
    } catch (e) {
      setFormError(asApiError(e));
    }
  });

  const fieldError = (key: string | undefined) => {
    if (!key) return undefined;
    const text = t(key);
    return text === key ? undefined : text;
  };

  const errorText = formError
    ? formError.code === 'INSUFFICIENT_ROLE'
      ? t('act.login.studentsOnly')
      : activationErrorMessage(formError, t)
    : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="grid min-h-screen lg:grid-cols-2">
        <aside className="relative hidden overflow-hidden bg-primary p-10 text-primary-fg lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div>
            <BrandLogo height={30} />
            <p className="mt-14 max-w-sm text-[28px] font-bold leading-tight tracking-tight">{t('act.login.title')}</p>
            <p className="mt-3 max-w-sm text-sm">{t('act.login.subtitle')}</p>
          </div>
          <ul className="mt-12 space-y-3">
            {POINT_KEYS.map((key) => (
              <li key={key} className="flex items-start gap-2.5 text-[13px] font-medium">
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
              type="button"
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
                <div className="flex items-center justify-between gap-2.5">
                  <BrandLogo height={30} priority />
                  <span className="rounded-md bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-primary-ink">
                    {t('act.portalName')}
                  </span>
                </div>

                <h1 className="mt-6 text-2xl font-bold tracking-tight">{t('auth.welcomeBack')}</h1>
                <p className="mt-1 text-sm text-muted">{t('act.login.subtitle')}</p>

                {errorText ? (
                  <div
                    className="mt-5 flex items-start gap-2.5 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
                    role="alert"
                    data-testid="login-error"
                  >
                    <AlertIcon size={18} className="mt-0.5 shrink-0" />
                    <span>{errorText}</span>
                  </div>
                ) : null}

                <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4" noValidate>
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
                        error={fieldError(errors.phone?.message)}
                        hint={t('act.login.sameAccount')}
                        inputMode="tel"
                        autoComplete="username"
                        name="phone"
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
                        error={fieldError(errors.password?.message)}
                        autoComplete="current-password"
                        name="password"
                      />
                    )}
                  />
                  <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
                    {isSubmitting ? t('auth.loggingIn') : t('auth.login')}
                  </Button>
                </form>

                <p className="mt-4 text-[12px] leading-relaxed text-muted">{t('act.login.forgot')}</p>
              </Card>

              <p className="mt-5 flex items-start gap-2 px-1 text-[12px] leading-relaxed text-subtle">
                <ShieldIcon size={14} className="mt-0.5 shrink-0" />
                <span>{t('act.login.deviceNote')}</span>
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
