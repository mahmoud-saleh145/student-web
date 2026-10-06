'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';

import { BrandLogo } from '@/components/brand/BrandLogo';
import { Button, Card } from '@/components/ui/core';
import { InlineError } from '@/components/ui/feedback';
import { Input, PasswordInput, Select } from '@/components/ui/forms';
import { CheckIcon, ChevronRightIcon, InfoIcon } from '@/components/ui/icons';
import { useAcademicYears, useDepartments, useFaculties, useUniversities } from '@/features/api';
import { localizedName } from '@/lib/format';
import { registerAcademicSchema, registerAccountSchema } from '@/features/schemas';
import { ApiError, asApiError } from '@/lib/api-client';
import { useSession, useTranslation } from '@/lib/session-context';
import { cn } from '@/lib/utils';
import { WEB_REQUEST_HEADER } from '@/lib/web-request';

type Step = 0 | 1 | 2;

const STEP_KEYS = ['auth.accountInfo', 'auth.academicInfo', 'auth.reviewInfo'];
const TAGLINE_KEY = 'search.idle.body';
const HIGHLIGHT_KEYS = ['home.newCourses', 'library.browseSubtitle', 'auth.deviceNoticeTitle', 'support.title'];

function StepIndicator({ step }: { step: Step }) {
  const { t } = useTranslation();
  return (
    <ol className="flex items-start">
      {STEP_KEYS.map((key, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <React.Fragment key={key}>
            <li className="flex w-28 shrink-0 flex-col items-center gap-2 text-center">
              <span
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'grid h-10 w-10 shrink-0 place-items-center rounded-full border text-[13px] font-bold transition-colors',
                  current && 'border-primary bg-primary text-primary-fg',
                  done && 'border-primary-soft bg-primary-soft text-primary-ink',
                  !current && !done && 'border-border-strong text-muted'
                )}
              >
                {done ? <CheckIcon size={16} /> : <span>{i + 1}</span>}
              </span>
              <span className={cn('text-[13px] font-semibold', current ? 'text-foreground' : 'text-muted')}>{t(key)}</span>
            </li>
            {i < STEP_KEYS.length - 1 ? (
              <span aria-hidden className={cn('mt-5 h-0.5 flex-1 rounded-full', done ? 'bg-primary' : 'bg-border')} />
            ) : null}
          </React.Fragment>
        );
      })}
    </ol>
  );
}

export default function RegisterPage() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const { refresh, status } = useSession();
  const [step, setStep] = React.useState<Step>(0);
  const [formError, setFormError] = React.useState<ApiError | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const accountForm = useForm({
    resolver: zodResolver(registerAccountSchema),
    defaultValues: { fullName: '', phone: '', password: '', confirmPassword: '' },
    mode: 'onBlur',
  });
  const academicForm = useForm({
    resolver: zodResolver(registerAcademicSchema),
    defaultValues: { universityId: '', facultyId: '', departmentId: '', academicYearId: '', gender: '' as unknown as 'MALE' },
    mode: 'onChange',
  });

  const universityId = academicForm.watch('universityId');
  const facultyId = academicForm.watch('facultyId');

  const universities = useUniversities();
  const faculties = useFaculties(universityId || null);
  const departments = useDepartments(facultyId || null);
  const years = useAcademicYears();

  React.useEffect(() => {
    if (status === 'authenticated') router.replace('/home');
  }, [status, router]);

  React.useEffect(() => {
    academicForm.setValue('facultyId', '');
    academicForm.setValue('departmentId', '');
  }, [universityId, academicForm]);

  React.useEffect(() => {
    academicForm.setValue('departmentId', '');
  }, [facultyId, academicForm]);

  const goNext = async () => {
    setFormError(null);
    if (step === 0) {
      const ok = await accountForm.trigger();
      if (ok) setStep(1);
      return;
    }
    if (step === 1) {
      const ok = await academicForm.trigger();
      if (ok) setStep(2);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setFormError(null);
    try {
      const account = registerAccountSchema.parse(accountForm.getValues());
      const academic = registerAcademicSchema.parse(academicForm.getValues());
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json', [WEB_REQUEST_HEADER]: '1' },
        credentials: 'same-origin',
        body: JSON.stringify({
          fullName: account.fullName,
          phone: account.phone,
          password: account.password,
          ...academic,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        const err = new ApiError({
          code: (body?.code ?? body?.error?.code ?? 'UNKNOWN') as ApiError['code'],
          status: res.status,
          message: body?.message ?? '',
        });
        if (err.code === 'PHONE_ALREADY_REGISTERED') setStep(0);
        throw err;
      }
      await refresh();
      router.replace('/home');
    } catch (e) {
      setFormError(asApiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const tr = (key: string | undefined) => {
    if (!key) return undefined;
    const v = t(key);
    return v === key ? key : v;
  };

  const reviewRows: { label: string; value: string; ltr?: boolean }[] = [
    { label: t('auth.fullName'), value: accountForm.getValues().fullName },
    { label: t('auth.phone'), value: accountForm.getValues().phone, ltr: true },
    // Named the same way the dropdowns name them, and the department included:
    // this is the last look before the account is created, and the department
    // decides which courses the student sees afterwards.
    { label: t('auth.university'), value: localizedName(universities.data?.find((u) => u.id === academicForm.getValues().universityId), language) },
    { label: t('auth.faculty'), value: localizedName(faculties.data?.find((f) => f.id === academicForm.getValues().facultyId), language) },
    { label: t('auth.department'), value: localizedName(departments.data?.find((d) => d.id === academicForm.getValues().departmentId), language) },
    { label: t('auth.academicYear'), value: localizedName(years.data?.find((y) => y.id === academicForm.getValues().academicYearId), language) },
  ];

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

        <main className="flex flex-col px-5 py-8 sm:px-8 lg:py-10">
          <div className="mx-auto w-full max-w-2xl">
            <div className="mb-6">
              <div className="flex items-center gap-2.5">
                <BrandLogo height={30} />
              </div>
              <h1 className="mt-5 text-2xl font-bold tracking-tight">{t('auth.createAccount')}</h1>
              <p className="mt-1 text-sm text-muted">{t('auth.stepOf', { current: step + 1, total: 3 })}</p>
            </div>

            <Card>
              <StepIndicator step={step} />

              {formError ? <div className="mt-6"><InlineError error={formError} /></div> : null}

              <div className="mt-7">
                {step === 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Controller control={accountForm.control} name="fullName" render={({ field }) => (
                      <Input className="sm:col-span-2" label={t('auth.fullName')} placeholder={t('auth.fullNamePlaceholder')} hint={t('auth.fullNameHint')} value={field.value} onChange={field.onChange} onBlur={field.onBlur} error={tr(accountForm.formState.errors.fullName?.message)} />
                    )} />
                    <Controller control={accountForm.control} name="phone" render={({ field }) => (
                      <Input className="sm:col-span-2" label={t('auth.phone')} placeholder={t('auth.phonePlaceholder')} value={field.value} onChange={field.onChange} onBlur={field.onBlur} error={tr(accountForm.formState.errors.phone?.message)} inputMode="tel" dir="ltr" />
                    )} />
                    <Controller control={accountForm.control} name="password" render={({ field }) => (
                      <PasswordInput label={t('auth.password')} value={field.value} onChange={field.onChange} onBlur={field.onBlur} error={tr(accountForm.formState.errors.password?.message)} />
                    )} />
                    <Controller control={accountForm.control} name="confirmPassword" render={({ field }) => (
                      <PasswordInput label={t('auth.confirmPassword')} value={field.value} onChange={field.onChange} onBlur={field.onBlur} error={tr(accountForm.formState.errors.confirmPassword?.message)} />
                    )} />
                  </div>
                ) : null}

                {step === 1 ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Controller control={academicForm.control} name="universityId" render={({ field }) => (
                      <Select label={t('auth.university')} value={field.value} onChange={(e) => field.onChange(e.target.value)} placeholder={t('auth.university')} options={(universities.data ?? []).map((u) => ({ value: u.id, label: u.nameAr || u.name }))} error={tr(academicForm.formState.errors.universityId?.message)} />
                    )} />
                    <Controller control={academicForm.control} name="facultyId" render={({ field }) => (
                      <Select label={t('auth.faculty')} value={field.value} onChange={(e) => field.onChange(e.target.value)} placeholder={t('auth.faculty')} disabled={!universityId} options={(faculties.data ?? []).map((f) => ({ value: f.id, label: f.nameAr || f.name }))} error={tr(academicForm.formState.errors.facultyId?.message)} />
                    )} />
                    <Controller control={academicForm.control} name="departmentId" render={({ field }) => (
                      <Select label={t('auth.department')} value={field.value} onChange={(e) => field.onChange(e.target.value)} placeholder={t('auth.department')} disabled={!facultyId} options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.nameAr || d.name }))} error={tr(academicForm.formState.errors.departmentId?.message)} />
                    )} />
                    <Controller control={academicForm.control} name="academicYearId" render={({ field }) => (
                      <Select label={t('auth.academicYear')} value={field.value} onChange={(e) => field.onChange(e.target.value)} placeholder={t('auth.academicYear')} options={(years.data ?? []).map((y) => ({ value: y.id, label: y.nameAr || y.name }))} error={tr(academicForm.formState.errors.academicYearId?.message)} />
                    )} />
                    <Controller control={academicForm.control} name="gender" render={({ field }) => (
                      <div className="sm:col-span-2">
                        <span className="mb-1.5 block text-[13px] font-semibold">{t('auth.gender')}</span>
                        <div className="grid grid-cols-2 gap-2">
                          {(['MALE', 'FEMALE'] as const).map((g) => (
                            <button
                              key={g}
                              type="button"
                              aria-pressed={field.value === g}
                              onClick={() => field.onChange(g)}
                              className={cn(
                                'h-10 cursor-pointer rounded-lg border text-sm font-semibold transition-colors',
                                field.value === g
                                  ? 'border-primary bg-primary text-primary-fg'
                                  : 'border-border-strong bg-surface text-muted hover:border-primary hover:text-foreground'
                              )}
                            >
                              {g === 'MALE' ? t('auth.male') : t('auth.female')}
                            </button>
                          ))}
                        </div>
                      </div>
                    )} />
                  </div>
                ) : null}

                {step === 2 ? (
                  <div className="flex flex-col gap-4">
                    <div>
                      <h2 className="text-[15px] font-bold">{t('auth.reviewInfo')}</h2>
                      <p className="mt-1 text-sm text-muted">{t('auth.reviewNote')}</p>
                    </div>
                    <div className="overflow-hidden rounded-lg border border-border">
                      {reviewRows.map((row) => (
                        <div key={row.label} className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 text-sm last:border-0">
                          <span className="shrink-0 text-muted">{row.label}</span>
                          <span className="truncate font-semibold" dir={row.ltr ? 'ltr' : undefined}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-start gap-2.5 rounded-lg border border-primary/30 bg-primary-soft p-4 text-sm">
                      <InfoIcon size={18} className="mt-0.5 shrink-0 text-primary-ink" />
                      <div>
                        <strong className="text-primary-ink">{t('auth.deviceNoticeTitle')}</strong>
                        <p className="mt-0.5 text-muted">{t('auth.deviceNoticeBody')}</p>
                      </div>
                    </div>
                    <p className="text-[13px] text-muted">{t('auth.termsNotice')}</p>
                  </div>
                ) : null}
              </div>

              <div className="mt-7 flex items-center gap-3 border-t border-border pt-5">
                <Button
                  variant="secondary"
                  onClick={() => (step === 0 ? router.back() : setStep((s) => (s - 1) as Step))}
                >
                  <ChevronRightIcon size={16} className={language === 'en' ? 'rotate-180' : undefined} />
                  {t('common.back')}
                </Button>
                <div className="flex-1" />
                {step < 2 ? (
                  <Button size="lg" onClick={goNext}>{t('common.next')}</Button>
                ) : (
                  <Button size="lg" loading={submitting} onClick={submit}>
                    {submitting ? t('auth.registering') : t('auth.register')}
                  </Button>
                )}
              </div>
            </Card>

            {step === 0 ? (
              <p className="mt-6 text-center text-sm text-muted">
                {t('auth.haveAccount')}{' '}
                <Link href="/login" className="font-semibold text-primary-ink underline-offset-4 hover:underline">
                  {t('auth.login')}
                </Link>
              </p>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}