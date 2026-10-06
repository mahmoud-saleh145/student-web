'use client';

import Link from 'next/link';

import { BrandLogo } from '@/components/brand/BrandLogo';
import { Card } from '@/components/ui/core';
import { hasSupportChannel, SupportLinks } from '@/components/support/SupportLinks';
import { ArrowRightIcon, InfoIcon } from '@/components/ui/icons';
import { useTranslation } from '@/lib/session-context';

export default function PasswordHelpPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="mx-auto w-full max-w-lg">
        <div className="flex items-center gap-2.5">
          <BrandLogo height={30} />
        </div>

        <h1 className="mt-6 text-2xl font-bold tracking-tight">{t('auth.passwordHelpTitle')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{t('auth.passwordHelpBody')}</p>

        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-border bg-surface-alt/60 p-3.5">
          <InfoIcon size={18} className="mt-0.5 shrink-0 text-primary-ink" />
          <div className="text-[13px] text-muted">
            <p className="font-bold text-foreground">{t('auth.contactAdmin')}</p>
            <p className="mt-0.5">{t('auth.passwordHelpNote')}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          {/*
            A student who forgot their password cannot sign in, so the in-app
            ticket form (which needs a session) was a dead end here. The mobile
            screen offers WhatsApp, a call and e-mail; so does this one.
          */}
          {hasSupportChannel() ? (
            <SupportLinks context={{ reason: 'password' }} className="[&>a]:flex-1" />
          ) : (
            <p className="text-[13px] text-muted">{t('auth.passwordHelpNote')}</p>
          )}
          <Link
            href="/login"
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface px-4 text-sm font-semibold transition-colors hover:bg-surface-alt"
          >
            {t('auth.login')}
            <ArrowRightIcon size={16} />
          </Link>
        </div>
      </Card>
    </div>
  );
}