'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Badge, Button, Card } from '@/components/ui/core';
import { CheckCircleIcon, KeyIcon, ShieldIcon } from '@/components/ui/icons';
import { ApiError } from '@/lib/api-client';
import { joinSheetActions } from '@/lib/course-access';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CodeValidation, CourseDetail, CourseJoinOptions, CoursePartsResponse } from '@/types/domain';

import {
  isNotOnOffer,
  useActivationEnroll,
  useRedeemCourseCode,
  useRefreshCourseOwnership,
  useValidateCourseCode,
} from '../api';
import { cardCodeProblem, isDefiniteRefusal, normalizeCardCode, wrongPlaceFor } from '../lib/errors';
import { saveLastActivation, type CourseOutcome } from '../lib/last-activation';
import {
  buildSnapshot,
  canEnterCode,
  courseOwnership,
  ownershipKnownFor,
  type OwnershipSnapshot,
  unlockSummary,
  type UnlockSummary,
} from '../lib/ownership';
import { activationRoutes } from '../lib/routes';
import { useActivationSession } from '../session';
import { activationErrorMessage, useActivationT } from '../use-t';

/**
 * A course's activation panel: what the student holds, and the code box.
 *
 * WHAT IT SHOWS is the server's answer, never a guess. Ownership comes from
 * `/courses/:id` (access state, section locks), `/courses/:id/parts` and
 * `/courses/:id/join-options` (`fullCourse.owned`, per-part `owned`); which
 * ways in are offered comes from the same rule the learning website's join
 * sheet uses (`joinSheetActions`). A whole-course owner sees no code box. A
 * part-only owner is told they own parts — not the course — and can add more.
 *
 * WHAT IT DOES is hand the code to the backend, which alone decides what the
 * card is, what it unlocks, and whether it is worth redeeming at all: a part
 * or section card for something already held is refused there and left
 * unspent. The panel asks the student nothing in between. Two read-only steps
 * sit around the call, because the redeem response does not say what was
 * unlocked:
 *
 *   1. BEFORE: `/codes/validate` names the card's kind (and gives an invalid,
 *      expired or used card its own message), and ownership is read as it
 *      stands — the "before" for the receipt.
 *   2. AFTER: ownership is read again and compared with what it was, so the
 *      success screen lists exactly what became owned — or says plainly that
 *      nothing changed.
 *
 * The code is never stored, logged, or put in a URL: it lives in this
 * component's state until the request is made and is cleared afterwards.
 */

type Phase = 'idle' | 'checking' | 'activating';

function Notice({
  tone,
  title,
  body,
  children,
}: {
  tone: 'neutral' | 'success' | 'warning' | 'danger';
  title: string;
  body?: string;
  children?: React.ReactNode;
}) {
  const style =
    tone === 'success'
      ? 'border-success/40 bg-success/10'
      : tone === 'danger'
        ? 'border-danger/40 bg-danger/10'
        : tone === 'warning'
          ? 'border-warning/40 bg-warning/10'
          : 'border-border bg-surface-alt';
  return (
    <div className={cn('rounded-lg border p-3.5 text-[13px]', style)}>
      <strong className="flex items-center gap-1.5">
        {tone === 'success' ? <CheckCircleIcon size={15} className="shrink-0 text-success" /> : null}
        {title}
      </strong>
      {body ? <p className="mt-1 text-muted">{body}</p> : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

export function CourseActivationCard({
  course,
  parts,
  joinOptions,
  joinOptionsError,
  joinOptionsLoading,
}: {
  course: CourseDetail;
  parts: CoursePartsResponse | undefined;
  joinOptions: CourseJoinOptions | undefined;
  joinOptionsError: unknown;
  joinOptionsLoading: boolean;
}) {
  const { t, language } = useActivationT();
  const router = useRouter();
  const { user } = useActivationSession();
  const validate = useValidateCourseCode(course.id);
  const redeem = useRedeemCourseCode(course.id);
  const enroll = useActivationEnroll(course.id);
  const refreshOwnership = useRefreshCourseOwnership(course.id);

  const [code, setCode] = React.useState('');
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [message, setMessage] = React.useState<{ text: string; goTo: 'wallet' | 'courses' | null } | null>(null);
  /** A second press while a request is in flight must not send a second one. */
  const busy = React.useRef(false);

  const snapshot = buildSnapshot({ course, parts, joinOptions });
  const ownership = courseOwnership(snapshot);
  const notOnOffer = !joinOptions && isNotOnOffer(joinOptionsError);
  const actions = joinOptions ? joinSheetActions({ ...joinOptions, accessState: course.access.state }) : null;
  const codeOffered = Boolean(actions?.code) && canEnterCode(snapshot);
  const state = course.access.state;

  const fail = (error: unknown) => {
    const apiCode = error instanceof ApiError ? error.code : undefined;
    setMessage({ text: activationErrorMessage(error, t, 'course-code'), goTo: wrongPlaceFor(apiCode, 'course-code') });
  };

  const finish = (outcome: CourseOutcome, summary: UnlockSummary | null, validation: CodeValidation | null) => {
    if (user) {
      saveLastActivation(window.sessionStorage, user.id, {
        kind: 'course',
        courseId: course.id,
        courseTitle: course.title,
        outcome,
        wholeCourse: summary?.wholeCourse ?? false,
        parts: (summary?.parts ?? []).map((p) => ({ title: p.title, titleAr: p.titleAr ?? null })),
        sections: (summary?.sections ?? []).map((s) => ({ title: s.title })),
        teacherName: validation?.targetType === 'TEACHER' ? (validation.teacher?.fullName ?? null) : null,
      });
    }
    router.push(activationRoutes.success);
  };

  const doRedeem = async (
    cardCode: string,
    before: OwnershipSnapshot,
    /** False when `before` could not be loaded in full: nothing may be itemised from it. */
    beforeKnown: boolean,
    validation: CodeValidation,
  ) => {
    setPhase('activating');
    try {
      await redeem.mutateAsync(cardCode);
    } catch (e) {
      if (isDefiniteRefusal(e instanceof ApiError ? e.status : undefined)) {
        fail(e);
        // A refusal can itself mean ownership changed elsewhere (already
        // enrolled, card already used): show the server's current answer.
        void refreshOwnership().catch(() => undefined);
        return;
      }

      // No answer, or a gateway that gave up: the redemption may have been
      // committed. Ask the server what the student holds now before saying
      // anything — "it failed, try again" could cost them a card that worked.
      if (beforeKnown) {
        try {
          const fresh = await refreshOwnership();
          const summary = unlockSummary(before, buildSnapshot(fresh));
          if (ownershipKnownFor(validation.targetType, fresh) && !summary.nothingNew) {
            setCode('');
            finish('unlocked', summary, validation);
            return;
          }
        } catch {
          // Still no answer: say exactly that, below.
        }
      } else {
        // Nothing to compare with, but the panel should still show the
        // server's current answer beside the message.
        void refreshOwnership().catch(() => undefined);
      }
      setMessage({ text: t('act.err.unknownOutcome'), goTo: null });
      return;
    }

    // The card is spent from here on. Whatever happens next, the student is
    // taken to the receipt — never left on a form that invites a second try.
    setCode('');
    try {
      const fresh = await refreshOwnership();
      if (!beforeKnown || !ownershipKnownFor(validation.targetType, fresh)) {
        // Activated, but one side of the comparison could not be loaded in
        // full. A plain receipt is truthful; an itemised one would be a guess.
        finish('unverified', null, validation);
        return;
      }
      const summary = unlockSummary(before, buildSnapshot(fresh));
      finish(summary.nothingNew ? 'nothing-new' : 'unlocked', summary, validation);
    } catch {
      finish('unverified', null, validation);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy.current) return;

    const cardCode = normalizeCardCode(code);
    const problem = cardCodeProblem(cardCode);
    if (problem) {
      setMessage({ text: t(problem === 'required' ? 'act.code.required' : 'act.code.format'), goTo: null });
      return;
    }

    busy.current = true;
    setMessage(null);
    setPhase('checking');
    try {
      // Read-only: names the card's kind, and turns away an invalid, expired
      // or used card with the backend's message before anything is attempted.
      const validation = await validate.mutateAsync(cardCode);
      // Ownership as the server sees it right now, not as this page last saw
      // it — the "before" the receipt is measured against.
      const current = await refreshOwnership();
      // Whether the card is worth redeeming is the backend's decision: it
      // refuses, without spending it, a card that would unlock nothing new.
      await doRedeem(cardCode, buildSnapshot(current), ownershipKnownFor(validation.targetType, current), validation);
    } catch (e) {
      fail(e);
    } finally {
      busy.current = false;
      setPhase('idle');
    }
  };

  const doEnroll = async (method: 'FREE' | 'ADMIN_APPROVAL') => {
    if (busy.current) return;
    busy.current = true;
    setMessage(null);
    setPhase('activating');
    try {
      const result = await enroll.mutateAsync(method);
      await refreshOwnership().catch(() => undefined);
      if (result.state === 'ACTIVE') finish('joined', null, null);
      else if (result.state === 'PENDING_APPROVAL') finish('pending-approval', null, null);
      else setMessage({ text: t('act.err.unexpected'), goTo: null });
    } catch (e) {
      fail(e);
    } finally {
      busy.current = false;
      setPhase('idle');
    }
  };

  // --- what the student holds ------------------------------------------------
  let holding: React.ReactNode = null;
  if (ownership.kind === 'full') {
    holding = <Notice tone="success" title={t('act.own.full.title')} body={t('act.own.full.body')} />;
  } else if (ownership.kind === 'parts') {
    holding = (
      <Notice
        tone="success"
        title={t('act.own.parts.title', { owned: formatNumber(ownership.owned.length, language), total: formatNumber(ownership.total, language) })}
        body={codeOffered ? t('act.own.parts.body') : undefined}
      />
    );
  } else if (ownership.kind === 'sections') {
    holding = <Notice tone="success" title={t('act.own.sections.title')} body={codeOffered ? t('act.own.sections.body') : undefined} />;
  } else if (ownership.kind === 'unknown') {
    holding = <Notice tone="success" title={t('act.own.active.title')} />;
  } else if (state === 'PENDING_APPROVAL') {
    holding = <Notice tone="warning" title={t('access.pendingTitle')} body={t('access.pendingBody')} />;
  } else if (state === 'PENDING_PAYMENT') {
    holding = <Notice tone="warning" title={t('access.paymentPendingTitle')} body={t('access.paymentPendingBody')} />;
  } else if (state === 'EXPIRED') {
    holding = <Notice tone="danger" title={t('access.expiredTitle')} body={t('access.expiredBody')} />;
  } else if (state === 'REVOKED') {
    holding = <Notice tone="danger" title={t('access.revoked')} body={t('access.expiredBody')} />;
  } else if (state === 'ARCHIVED' || course.status === 'ARCHIVED') {
    holding = <Notice tone="neutral" title={t('access.archivedTitle')} body={t('access.archivedBody')} />;
  }

  const hasLiveAccess = ownership.kind !== 'none';
  const working = phase !== 'idle';

  return (
    <div data-testid="activation-card">
    <Card>
      <div className="flex items-start justify-between gap-3">
        {hasLiveAccess ? (
          <span className="text-[13px] font-semibold text-muted">
            {course.access.expiresAt
              ? t('access.expiresOn', { date: formatDate(course.access.expiresAt, language) })
              : t('access.lifetimeAccess')}
          </span>
        ) : course.isFree ? (
          <Badge label={t('common.free')} tone="success" />
        ) : course.price ? (
          <span className="text-xl font-bold tracking-tight" data-testid="course-price">
            {formatMoney(course.price, language)}
          </span>
        ) : (
          <span />
        )}
      </div>

      {holding ? (
        <div className="mt-3" data-testid="ownership-notice" data-ownership={ownership.kind}>
          {holding}
        </div>
      ) : null}

      {joinOptionsLoading ? (
        <div className="mt-4 h-28 animate-pulse rounded-lg bg-surface-alt" />
      ) : notOnOffer ? (
        hasLiveAccess ? null : <p className="mt-4 rounded-lg border border-border p-3 text-[13px] text-muted">{t('act.course.notOnOffer')}</p>
      ) : !joinOptions || !actions ? (
        <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-[13px] text-danger" role="alert">
          {activationErrorMessage(joinOptionsError, t)}
        </p>
      ) : (
        <>
          {codeOffered ? (
            <form onSubmit={submit} className="mt-4 rounded-lg border border-border bg-surface-alt/60 p-3.5" noValidate>
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <KeyIcon size={16} className="text-primary-ink" />
                {t('act.code.title')}
              </h3>
              <p className="mb-3 mt-1 text-[13px] leading-relaxed text-muted">{t('act.code.hint')}</p>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold">{t('access.codeLabel')}</span>
                <input
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    if (message) setMessage(null);
                  }}
                  placeholder={t('access.codePlaceholder')}
                  disabled={working}
                  name="activation-code"
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="text"
                  maxLength={48}
                  dir="ltr"
                  data-testid="code-input"
                  className="h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-[15px] font-semibold tracking-wide text-foreground outline-none transition placeholder:font-normal placeholder:tracking-normal placeholder:text-subtle focus:border-primary"
                />
              </label>

              <Button type="submit" fullWidth size="lg" className="mt-3" loading={working} data-testid="code-submit">
                {phase === 'checking' ? t('act.code.checking') : phase === 'activating' ? t('act.code.activating') : t('act.code.submit')}
              </Button>
            </form>
          ) : !hasLiveAccess && !actions.free && !actions.approval ? (
            <p className="mt-4 rounded-lg border border-border p-3 text-[13px] text-muted">{t('access.noMethods')}</p>
          ) : null}

          {actions.free || actions.approval ? (
            <div className="mt-3 flex flex-col gap-2">
              {codeOffered ? <p className="text-[12px] font-semibold text-muted">{t('act.code.otherWays')}</p> : null}
              {actions.free ? (
                <Button fullWidth variant={codeOffered ? 'secondary' : 'primary'} disabled={working} onClick={() => void doEnroll('FREE')} data-testid="join-free">
                  {t('act.code.joinFree')}
                </Button>
              ) : null}
              {actions.approval ? (
                <Button fullWidth variant="secondary" disabled={working} onClick={() => void doEnroll('ADMIN_APPROVAL')}>
                  {t('act.code.requestApproval')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {message ? (
        <div className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-3 text-[13px] text-danger" role="alert" data-testid="activation-error">
          <p>{message.text}</p>
          {message.goTo ? (
            <Link
              href={message.goTo === 'wallet' ? activationRoutes.wallet : activationRoutes.courses}
              className="mt-2 inline-flex font-bold underline underline-offset-4"
            >
              {t(message.goTo === 'wallet' ? 'act.err.goToWallet' : 'act.err.goToCourses')}
            </Link>
          ) : null}
        </div>
      ) : null}

      <p className="mt-4 flex items-center justify-center gap-1.5 text-[12px] text-subtle">
        <ShieldIcon size={13} />
        {t('act.course.outlineNote')}
      </p>
    </Card>
    </div>
  );
}
