'use client';

import type { ReactNode } from 'react';

import { MessageIcon, PhoneIcon, SendIcon } from '@/components/ui/icons';
import { useTranslation } from '@/lib/session-context';
import { mailtoUrl, supportConfig, telUrl, whatsappUrl, type SupportContext } from '@/lib/support';
import { cn } from '@/lib/utils';

const linkClass =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold transition hover:bg-surface-alt';

/**
 * WhatsApp / call / e-mail, the three channels the mobile app offers. Renders
 * nothing for a channel that is not configured, and nothing at all when none
 * is — rather than a button that goes nowhere.
 */
export function SupportLinks({
  context,
  channels = ['whatsapp', 'call', 'email'],
  className,
}: {
  context: SupportContext;
  channels?: ('whatsapp' | 'call' | 'email')[];
  className?: string;
}) {
  const { t } = useTranslation();
  const links: { key: string; href: string; label: string; icon: ReactNode; external: boolean }[] = [];

  const wa = channels.includes('whatsapp') ? whatsappUrl(supportConfig, context) : null;
  if (wa) links.push({ key: 'wa', href: wa, label: t('support.whatsapp'), icon: <MessageIcon size={16} />, external: true });
  const tel = channels.includes('call') ? telUrl(supportConfig) : null;
  if (tel) links.push({ key: 'tel', href: tel, label: t('support.callUs'), icon: <PhoneIcon size={16} />, external: false });
  const mail = channels.includes('email') ? mailtoUrl(supportConfig, context) : null;
  if (mail) links.push({ key: 'mail', href: mail, label: t('support.email'), icon: <SendIcon size={16} />, external: false });

  if (links.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {links.map((l) => (
        <a
          key={l.key}
          href={l.href}
          className={linkClass}
          {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {l.icon}
          {l.label}
        </a>
      ))}
    </div>
  );
}

/** True when at least one support channel is configured. */
export function hasSupportChannel(): boolean {
  return Boolean(whatsappUrl(supportConfig, { reason: 'general' }) || telUrl(supportConfig) || mailtoUrl(supportConfig, { reason: 'general' }));
}
