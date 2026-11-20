'use client';

import Link from 'next/link';
import * as React from 'react';

import { OpenAppCard } from '@/activation/components/OpenAppCard';
import { readLastActivation, type ActivationReceipt, type CourseActivation } from '@/activation/lib/last-activation';
import { activationRoutes } from '@/activation/lib/routes';
import { useActivationSession } from '@/activation/session';
import { useActivationT, type ActivationT } from '@/activation/use-t';
import { Card, Skeleton } from '@/components/ui/core';
import { AlertIcon, CheckCircleIcon, ClockIcon } from '@/components/ui/icons';
import { formatMoney, formatNumber, localizedName } from '@/lib/format';
import type { Language } from '@/i18n/dictionaries';

/**
 * The confirmation after an activation: what was unlocked, and what to do next.
 *
 * It renders the receipt the activating page left in this tab's session
 * storage (`lib/last-activation.ts`) — a list of what the server confirmed
 * became owned. The address carries nothing: no code, no id, no amount. Opened
 * directly, or after the receipt has expired, the page says there is nothing
 * recent to show and points to My activations, which reads the account's real
 * state from the backend.
 *
 * The next step is always the same: open the app.
 */
export default function ActivationSuccessPage() {
  const { t, language } = useActivationT();
  const { user, status } = useActivationSession();
  const [receipt, setReceipt] = React.useState<ActivationReceipt | null | undefined>(undefined);

  React.useEffect(() => {
    if (user) setReceipt(readLastActivation(window.sessionStorage, user.id));
    else if (status !== 'loading') setReceipt(null);
  }, [user, status]);

  if (receipt === undefined) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Skeleton height={180} />
        <Skeleton height={160} />
      </div>
    );
  }

  const view = receipt ? describe(receipt, t, language) : null;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4" data-testid="success-page" data-outcome={view?.outcome ?? 'empty'}>
      <Card>
        {view ? (
          <div className="flex flex-col items-center text-center">
            <span
              className={
                view.tone === 'success'
                  ? 'grid h-14 w-14 place-items-center rounded-full bg-success/10 text-success'
                  : view.tone === 'warning'
                    ? 'grid h-14 w-14 place-items-center rounded-full bg-warning/10 text-warning'
                    : 'grid h-14 w-14 place-items-center rounded-full bg-surface-alt text-muted'
              }
            >
              {view.tone === 'success' ? <CheckCircleIcon size={30} /> : view.tone === 'warning' ? <AlertIcon size={28} /> : <ClockIcon size={28} />}
            </span>
            <h1 className="mt-4 text-xl font-bold tracking-tight" data-testid="success-title">
              {view.title}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted" data-testid="success-body">
              {view.body}
            </p>

            {view.items.length > 0 ? (
              <ul className="mt-4 flex w-full flex-col gap-2 text-start" data-testid="success-items">
                {view.items.map((item) => (
                  <li key={item} className="flex items-center gap-2.5 rounded-lg border border-success/40 bg-success/5 px-3.5 py-2.5 text-sm font-semibold">
                    <CheckCircleIcon size={16} className="shrink-0 text-success" />
                    <span className="min-w-0 flex-1">{item}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {view.notes.map((note) => (
              <p key={note} className="mt-3 text-[13px] text-muted">
                {note}
              </p>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center py-4 text-center">
            <h1 className="text-lg font-bold">{t('act.success.emptyTitle')}</h1>
            <p className="mt-2 text-sm text-muted">{t('act.success.emptyBody')}</p>
          </div>
        )}
      </Card>

      {view && view.tone === 'success' ? <OpenAppCard /> : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href={activationRoutes.myActivations}
          className="flex h-10 flex-1 items-center justify-center rounded-lg border border-border-strong bg-surface px-4 text-sm font-semibold transition hover:bg-surface-alt"
        >
          {t('act.success.viewActivations')}
        </Link>
        {receipt?.kind === 'course' ? (
          <Link
            href={activationRoutes.course(receipt.courseId)}
            className="flex h-10 flex-1 items-center justify-center rounded-lg border border-border-strong bg-surface px-4 text-sm font-semibold transition hover:bg-surface-alt"
          >
            {t('act.success.viewCourse')}
          </Link>
        ) : null}
        <Link
          href={receipt?.kind === 'course' || !receipt ? activationRoutes.courses : activationRoutes.library}
          className="flex h-10 flex-1 items-center justify-center rounded-lg px-4 text-sm font-semibold text-muted transition hover:bg-surface-alt hover:text-foreground"
        >
          {t('act.success.another')}
        </Link>
      </div>
    </div>
  );
}

interface ReceiptView {
  outcome: string;
  tone: 'success' | 'warning' | 'neutral';
  title: string;
  body: string;
  items: string[];
  notes: string[];
}

function describeCourse(r: CourseActivation, t: ActivationT, language: Language): ReceiptView {
  const course = r.courseTitle;
  const teacherNote = r.teacherName ? [t('act.success.teacherNote', { name: r.teacherName })] : [];

  switch (r.outcome) {
    case 'nothing-new':
      // Accepted by the backend with nothing newly opened. Since the backend
      // refuses a card that would change nothing, this is a renewal — the
      // access period moved, which this screen does not itemise — so it is
      // stated plainly, not as a warning.
      return {
        outcome: r.outcome,
        tone: 'neutral',
        title: t('act.success.nothingNewTitle'),
        body: t('act.success.nothingNewBody', { course }),
        items: [],
        notes: [],
      };
    case 'pending-approval':
      return {
        outcome: r.outcome,
        tone: 'neutral',
        title: t('act.success.pendingTitle'),
        body: t('act.success.pendingBody', { course }),
        items: [],
        notes: [],
      };
    case 'joined':
      return { outcome: r.outcome, tone: 'success', title: t('act.success.title'), body: t('act.success.joined', { course }), items: [], notes: [] };
    case 'unverified':
      // The server accepted the code; what changed could not be re-read. Say
      // only what is known, and send the student to the authoritative list.
      return {
        outcome: r.outcome,
        tone: 'success',
        title: t('act.success.title'),
        body: t('act.success.emptyBody'),
        items: [],
        notes: teacherNote,
      };
    default:
      if (r.wholeCourse) {
        return {
          outcome: 'whole-course',
          tone: 'success',
          title: t('act.success.title'),
          body: t('act.success.wholeCourse', { course }),
          items: [],
          notes: teacherNote,
        };
      }
      if (r.parts.length > 0) {
        return {
          outcome: 'parts',
          tone: 'success',
          title: t('act.success.title'),
          body: t('act.success.partsIntro', { course }),
          items: [
            ...r.parts.map((p) => localizedName({ name: p.title, nameAr: p.titleAr }, language)),
            ...r.sections.map((s) => s.title),
          ],
          notes: teacherNote,
        };
      }
      return {
        outcome: 'sections',
        tone: 'success',
        title: t('act.success.title'),
        body: t('act.success.sectionsIntro', { course }),
        items: r.sections.map((s) => s.title),
        notes: teacherNote,
      };
  }
}

function describe(receipt: ActivationReceipt, t: ActivationT, language: Language): ReceiptView {
  if (receipt.kind === 'course') return describeCourse(receipt, t, language);

  if (receipt.kind === 'recharge') {
    const money = (amount: number) => formatMoney({ amount, currency: receipt.currency }, language);
    return {
      outcome: 'recharge',
      tone: 'success',
      title: t('act.success.rechargeTitle'),
      body: receipt.credited > 0 ? t('act.success.recharge', { amount: money(receipt.credited) }) : t('act.success.rechargeZero'),
      items: [],
      notes: [t('act.success.balance', { balance: money(receipt.balance) })],
    };
  }

  const money = (amount: number) => formatMoney({ amount, currency: receipt.currency }, language);
  return {
    outcome: receipt.alreadyPurchased ? 'library-already' : 'library',
    tone: 'success',
    title: t('act.success.libraryTitle'),
    body: t('act.success.library', { title: receipt.title }),
    items: [],
    notes: receipt.alreadyPurchased
      ? [t('act.success.alreadyPurchased'), t('act.success.balance', { balance: money(receipt.balanceAfter) })]
      : [
          t('act.success.libraryParts', { count: formatNumber(receipt.partsGranted, language) }),
          t('act.success.libraryPaid', { amount: money(receipt.pricePaid) }),
          t('act.success.balance', { balance: money(receipt.balanceAfter) }),
        ],
  };
}
