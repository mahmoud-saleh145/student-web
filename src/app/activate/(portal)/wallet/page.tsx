'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { useActivationRecharge, useActivationWallet, useActivationWalletTransactions } from '@/activation/api';
import { cardCodeProblem, normalizeCardCode, wrongPlaceFor } from '@/activation/lib/errors';
import { saveLastActivation } from '@/activation/lib/last-activation';
import { activationRoutes } from '@/activation/lib/routes';
import { useActivationSession } from '@/activation/session';
import { activationErrorMessage, useActivationT } from '@/activation/use-t';
import { Badge, Button, Card, CardTitle, Skeleton, Stat } from '@/components/ui/core';
import { ErrorState, InlineError, PageHeader } from '@/components/ui/feedback';
import { ArrowRightIcon, CreditCardIcon, HistoryIcon, TrendDownIcon, TrendingUpIcon, WalletIcon } from '@/components/ui/icons';
import { DataTable, RowLine, SectionHeading, type Column } from '@/components/ui/table';
import { ApiError } from '@/lib/api-client';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { WalletTransaction } from '@/types/domain';

/**
 * The student's credit: balance, the ledger, and recharge-card redemption.
 *
 * Every figure is the backend's. The balance and the two totals come from
 * `GET /wallet`; each ledger line shows the backend's own before/after
 * balances; nothing is summed or adjusted in the browser.
 *
 * Credit is added in exactly one way from here: redeeming a recharge card the
 * administration issued (`POST /wallet/redeem`). The card's value comes from
 * the card. There is no amount field, no card payment, no gateway — and the
 * page says so, because a student looking for "pay online" should learn here
 * that it does not exist rather than go looking for it.
 */
export default function ActivationWalletPage() {
  const { t, language } = useActivationT();
  const router = useRouter();
  const { user } = useActivationSession();
  const wallet = useActivationWallet();
  const transactions = useActivationWalletTransactions();
  const recharge = useActivationRecharge();
  const [code, setCode] = React.useState('');
  const [message, setMessage] = React.useState<{ text: string; toCourses: boolean } | null>(null);
  const busy = React.useRef(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy.current) return;

    const cardCode = normalizeCardCode(code);
    const problem = cardCodeProblem(cardCode);
    if (problem) {
      setMessage({ text: t(problem === 'required' ? 'act.code.required' : 'act.code.format'), toCourses: false });
      return;
    }

    busy.current = true;
    setMessage(null);
    try {
      const res = await recharge.mutateAsync(cardCode);
      setCode('');
      if (user) {
        saveLastActivation(window.sessionStorage, user.id, {
          kind: 'recharge',
          credited: res.credited,
          balance: res.balance,
          currency: res.currency,
        });
      }
      router.push(activationRoutes.success);
    } catch (e) {
      const apiCode = e instanceof ApiError ? e.code : undefined;
      setMessage({ text: activationErrorMessage(e, t, 'recharge'), toCourses: wrongPlaceFor(apiCode, 'recharge') === 'courses' });
    } finally {
      busy.current = false;
    }
  };

  const items = React.useMemo(() => transactions.data?.items ?? [], [transactions.data]);
  const currency = wallet.data?.currency ?? 'EGP';

  const typeLabel = React.useCallback(
    (tx: WalletTransaction) => {
      const key = `act.wallet.tx.${tx.type}`;
      const label = t(key);
      return label === key ? tx.type : label;
    },
    [t],
  );

  const amountCell = React.useCallback(
    (tx: WalletTransaction) => (
      <span className={tx.direction === 'CREDIT' ? 'text-success' : 'text-danger'}>
        {tx.direction === 'CREDIT' ? '+' : '−'}
        {formatMoney({ amount: tx.amount, currency: tx.currency }, language)}
      </span>
    ),
    [language],
  );

  const columns = React.useMemo<Column<WalletTransaction>[]>(
    () => [
      {
        key: 'description',
        header: t('web.col.subject'),
        className: 'min-w-[220px]',
        render: (tx) => (
          <div className="min-w-0">
            <div className="clamp-1 text-sm font-semibold">{tx.note ?? typeLabel(tx)}</div>
            <div className="text-[13px] text-muted">
              {t('wallet.balance')}: {formatMoney({ amount: tx.balanceAfter, currency: tx.currency }, language)}
            </div>
          </div>
        ),
      },
      {
        key: 'type',
        header: t('web.col.type'),
        className: 'whitespace-nowrap',
        render: (tx) => <Badge label={typeLabel(tx)} tone={tx.direction === 'CREDIT' ? 'success' : 'danger'} />,
      },
      {
        key: 'amount',
        header: t('web.col.amount'),
        headerClassName: 'text-end',
        className: 'whitespace-nowrap text-end font-semibold',
        render: amountCell,
      },
      {
        key: 'date',
        header: t('web.col.date'),
        className: 'whitespace-nowrap text-[13px] text-muted',
        render: (tx) => <time dateTime={tx.createdAt}>{formatDateTime(tx.createdAt, language)}</time>,
      },
    ],
    [t, language, typeLabel, amountCell],
  );

  const money = (amount: number | undefined) =>
    wallet.isLoading ? <Skeleton className="h-6 w-24" /> : formatMoney({ amount: amount ?? 0, currency }, language);

  return (
    <>
      <PageHeader
        title={t('wallet.title')}
        subtitle={t('act.wallet.subtitle')}
        breadcrumbs={[{ href: activationRoutes.home, label: t('act.nav.home') }, { label: t('wallet.title') }]}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div data-testid="wallet-balance">
          <Stat icon={<WalletIcon size={19} />} tone="primary" label={t('wallet.balance')} value={money(wallet.data?.balance)} />
        </div>
        <Stat icon={<TrendingUpIcon size={19} />} tone="success" label={t('act.wallet.totalRecharged')} value={money(wallet.data?.totalRecharged)} />
        <Stat icon={<TrendDownIcon size={19} />} tone="warning" label={t('act.wallet.totalSpent')} value={money(wallet.data?.totalSpent)} />
      </div>

      {wallet.isError ? (
        <div className="mt-4">
          <InlineError error={wallet.error} />
        </div>
      ) : null}

      <Card className="mt-6">
        <CardTitle>{t('wallet.redeemCard')}</CardTitle>
        <p className="-mt-2 mb-4 text-[13px] text-muted">{t('wallet.redeemSubtitle')}</p>
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-start" noValidate>
          <div className="flex-1">
            <label className="sr-only" htmlFor="recharge-code">
              {t('wallet.redeemCard')}
            </label>
            <input
              id="recharge-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                if (message) setMessage(null);
              }}
              placeholder={t('access.codePlaceholder')}
              disabled={recharge.isPending}
              name="recharge-code"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={48}
              dir="ltr"
              data-testid="recharge-input"
              className="h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-[15px] font-semibold tracking-wide text-foreground outline-none transition placeholder:font-normal placeholder:tracking-normal placeholder:text-subtle focus:border-primary"
            />
          </div>
          <Button type="submit" size="lg" loading={recharge.isPending} data-testid="recharge-submit">
            <CreditCardIcon size={17} />
            {t('access.redeem')}
          </Button>
        </form>

        {message ? (
          <div className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-3 text-[13px] text-danger" role="alert" data-testid="recharge-error">
            <p>{message.text}</p>
            {message.toCourses ? (
              <Link href={activationRoutes.courses} className="mt-2 inline-flex font-bold underline underline-offset-4">
                {t('act.err.goToCourses')}
              </Link>
            ) : null}
          </div>
        ) : null}

        <p className="mt-4 border-t border-border pt-3 text-[12px] leading-relaxed text-muted" data-testid="wallet-offline-note">
          {t('act.wallet.adminIssued')}
        </p>
      </Card>

      <Card className="mt-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">{t('wallet.scopeTitle')}</div>
          <p className="mt-0.5 text-[13px] text-muted">{t('wallet.scopeBody')}</p>
        </div>
        <Link
          href={activationRoutes.library}
          className="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold text-muted transition hover:bg-surface-alt hover:text-foreground"
        >
          {t('act.wallet.browseLibrary')}
          <ArrowRightIcon size={15} />
        </Link>
      </Card>

      <section className="mt-8">
        <SectionHeading title={t('wallet.history')} />
        {transactions.isPending ? (
          <div className="space-y-2.5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={64} />
            ))}
          </div>
        ) : transactions.isError ? (
          <ErrorState error={transactions.error} onRetry={() => void transactions.refetch()} />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={items}
              rowKey={(tx) => tx.id}
              empty={t('wallet.empty.body')}
              mobile={(tx) => (
                <div>
                  <RowLine label={t('web.col.subject')}>{tx.note ?? typeLabel(tx)}</RowLine>
                  <RowLine label={t('web.col.amount')}>{amountCell(tx)}</RowLine>
                  <RowLine label={t('wallet.balance')}>{formatMoney({ amount: tx.balanceAfter, currency: tx.currency }, language)}</RowLine>
                  <RowLine label={t('web.col.date')}>{formatDateTime(tx.createdAt, language)}</RowLine>
                </div>
              )}
            />
            {transactions.hasNextPage ? (
              <div className="mt-5 flex justify-center">
                <Button variant="secondary" onClick={() => void transactions.fetchNextPage()} loading={transactions.isFetchingNextPage}>
                  <HistoryIcon size={16} />
                  {t('common.seeAll')}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}
