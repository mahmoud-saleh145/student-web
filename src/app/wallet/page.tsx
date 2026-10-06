'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Badge, Button, Card, CardTitle, Skeleton, Stat } from '@/components/ui/core';
import { AppShell, ErrorState, InlineError, PageHeader } from '@/components/ui/feedback';
import { ArrowRightIcon, CreditCardIcon, HistoryIcon, TrendDownIcon, TrendingUpIcon, WalletIcon } from '@/components/ui/icons';
import { Column, DataTable, RowLine, SectionHeading } from '@/components/ui/table';
import { useRedeemRecharge, useWallet, useWalletTransactions } from '@/features/api';
import { formatDateTime, formatMoney } from '@/lib/format';
import { useTranslation } from '@/lib/session-context';
import { toast } from '@/store/stores';
import type { WalletTransaction } from '@/types/domain';

export default function WalletPage() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const wallet = useWallet();
  const transactions = useWalletTransactions();
  const redeem = useRedeemRecharge();
  const [code, setCode] = React.useState('');

  const submit = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) return;
    try {
      const res = await redeem.mutateAsync(trimmed);
      toast.success(`${res.credited}`);
      setCode('');
      redeem.reset();
    } catch {
      // error rendered in the form below
    }
  };

  const items = React.useMemo(() => transactions.data?.items ?? [], [transactions.data]);
  const currency = wallet.data?.currency ?? 'EGP';

  const totals = React.useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    for (const tx of items) {
      if (tx.direction === 'CREDIT') totalIn += tx.amount;
      else totalOut += tx.amount;
    }
    return { totalIn, totalOut };
  }, [items]);

  const columns = React.useMemo<Column<WalletTransaction>[]>(
    () => [
      {
        key: 'description',
        header: t('web.col.subject'),
        className: 'min-w-[240px]',
        render: (tx) => (
          <div className="min-w-0">
            <div className="clamp-1 text-sm font-semibold">{tx.note ?? tx.type}</div>
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
        render: (tx) => (
          <Badge
            label={tx.type}
            tone={tx.direction === 'CREDIT' ? 'success' : tx.direction === 'DEBIT' ? 'danger' : 'warning'}
          />
        ),
      },
      {
        key: 'amount',
        header: t('web.col.amount'),
        headerClassName: 'text-end',
        className: 'whitespace-nowrap text-end font-semibold',
        render: (tx) => (
          <span className={tx.direction === 'CREDIT' ? 'text-success' : 'text-danger'}>
            {tx.direction === 'CREDIT' ? '+' : '−'}
            {formatMoney({ amount: tx.amount, currency: tx.currency }, language)}
          </span>
        ),
      },
      {
        key: 'date',
        header: t('web.col.date'),
        className: 'whitespace-nowrap text-[13px] text-muted',
        render: (tx) => <time dateTime={tx.createdAt}>{formatDateTime(tx.createdAt, language)}</time>,
      },
      {
        key: 'status',
        header: t('web.col.status'),
        className: 'whitespace-nowrap',
        render: (tx) => (
          <Badge label={t('common.done')} tone={tx.direction === 'CREDIT' ? 'success' : 'neutral'} />
        ),
      },
    ],
    [t, language]
  );

  return (
    <AppShell>
      <PageHeader title={t('wallet.title')} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          icon={<WalletIcon size={19} />}
          tone="primary"
          label={t('wallet.balance')}
          value={
            wallet.isLoading ? (
              <Skeleton className="h-6 w-24" />
            ) : (
              formatMoney({ amount: wallet.data?.balance ?? 0, currency }, language)
            )
          }
        />
        <Stat
          icon={<TrendingUpIcon size={19} />}
          tone="success"
          label={t('wallet.topUp')}
          value={transactions.isLoading ? <Skeleton className="h-6 w-24" /> : formatMoney({ amount: totals.totalIn, currency }, language)}
        />
        <Stat
          icon={<TrendDownIcon size={19} />}
          tone="warning"
          label={t('wallet.history')}
          value={transactions.isLoading ? <Skeleton className="h-6 w-24" /> : formatMoney({ amount: totals.totalOut, currency }, language)}
        />
      </div>

      {wallet.isError ? (
        <div className="mt-4">
          <InlineError error={wallet.error} />
        </div>
      ) : null}

      <Card className="mt-6">
        <CardTitle>{t('wallet.redeemCard')}</CardTitle>
        <p className="-mt-2 mb-4 text-[13px] text-muted">{t('wallet.redeemSubtitle')}</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex-1">
            <label className="sr-only" htmlFor="redeem-code">
              {t('wallet.redeemCard')}
            </label>
            <input
              id="redeem-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX"
              dir="ltr"
              className="h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground outline-none transition placeholder:text-subtle focus:border-primary"
            />
          </div>
          <Button loading={redeem.isPending} disabled={code.trim().length < 4} onClick={submit}>
            <CreditCardIcon size={17} />
            {t('access.redeem')}
          </Button>
        </div>
        {redeem.isError ? (
          <div className="mt-3">
            <InlineError error={redeem.error} />
          </div>
        ) : null}
      </Card>

      <Card className="mt-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">{t('wallet.scopeTitle')}</div>
          <p className="mt-0.5 text-[13px] text-muted">{t('wallet.scopeBody')}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push('/library')}>
          {t('library.title')}
          <ArrowRightIcon size={15} />
        </Button>
      </Card>

      <section className="mt-8">
        <SectionHeading title={t('wallet.history')} subtitle={t('web.resultsCount', { count: items.length })} />
        {transactions.isLoading ? (
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
                  <RowLine label={t('web.col.subject')}>{tx.note ?? tx.type}</RowLine>
                  <RowLine label={t('web.col.type')}>
                    <Badge
                      label={tx.type}
                      tone={tx.direction === 'CREDIT' ? 'success' : tx.direction === 'DEBIT' ? 'danger' : 'warning'}
                    />
                  </RowLine>
                  <RowLine label={t('web.col.amount')}>
                    <span className={tx.direction === 'CREDIT' ? 'text-success' : 'text-danger'}>
                      {tx.direction === 'CREDIT' ? '+' : '−'}
                      {formatMoney({ amount: tx.amount, currency: tx.currency }, language)}
                    </span>
                  </RowLine>
                  <RowLine label={t('wallet.balance')}>
                    {formatMoney({ amount: tx.balanceAfter, currency: tx.currency }, language)}
                  </RowLine>
                  <RowLine label={t('web.col.date')}>{formatDateTime(tx.createdAt, language)}</RowLine>
                  <RowLine label={t('web.col.status')}>
                    <Badge label={t('common.done')} tone={tx.direction === 'CREDIT' ? 'success' : 'neutral'} />
                  </RowLine>
                </div>
              )}
            />
            {transactions.hasNextPage ? (
              <div className="mt-5 flex justify-center">
                <Button variant="secondary" onClick={() => void transactions.fetchNextPage()}>
                  <HistoryIcon size={16} />
                  {t('common.seeAll')}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </AppShell>
  );
}