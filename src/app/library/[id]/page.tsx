'use client';

import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';

import { Badge, Button, Card, CardTitle, KeyValue, Skeleton } from '@/components/ui/core';
import { AppShell, ErrorState, PageHeader } from '@/components/ui/feedback';
import { Sheet } from '@/components/ui/forms';
import { DataTable, SectionHeading, type Column } from '@/components/ui/table';
import { useLibraryMaterial, useLibraryPurchase, useLibraryQuote } from '@/features/api';
import { formatMoney, formatNumber, localizedName } from '@/lib/format';
import { useSession, useTranslation } from '@/lib/session-context';
import { toast } from '@/store/stores';
import type { LibraryPurchaseKind } from '@/types/domain';

type Part = NonNullable<ReturnType<typeof useLibraryMaterial>['data']>['parts'][number];

export default function LibraryMaterialPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { t, language } = useTranslation();
  const router = useRouter();
  const { status } = useSession();
  const query = useLibraryMaterial(id);
  const quote = useLibraryQuote();
  const purchase = useLibraryPurchase(id);
  const [pending, setPending] = React.useState<{ kind: LibraryPurchaseKind; targetId: string } | null>(null);

  React.useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  const openPurchase = (kind: LibraryPurchaseKind, targetId: string) => {
    setPending({ kind, targetId });
    quote.mutate({ kind, targetId });
  };

  const closeSheet = () => {
    setPending(null);
    quote.reset();
  };

  const confirm = async () => {
    if (!pending) return;
    try {
      const res = await purchase.mutateAsync(pending);
      toast.success(`${res.title}`);
      closeSheet();
    } catch {
      // error shown via purchase state below
    }
  };

  if (query.isLoading || status === 'loading') {
    return (
      <AppShell>
        <Skeleton className="h-9 w-64" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <Skeleton height={120} />
            <Skeleton height={280} />
          </div>
          <Skeleton height={220} />
        </div>
      </AppShell>
    );
  }

  if (query.isError || !query.data) {
    return (
      <AppShell>
        <PageHeader title={t('library.title')} back />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </AppShell>
    );
  }

  const material = query.data;
  const title = localizedName({ name: material.title, nameAr: material.titleAr }, language);

  const columns: Column<Part>[] = [
    {
      key: 'part',
      header: t('library.parts'),
      render: (part) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{localizedName({ name: part.title, nameAr: part.titleAr }, language)}</div>
          {part.pageCount ? <div className="text-xs text-muted">{formatNumber(part.pageCount, language)}</div> : null}
        </div>
      ),
    },
    {
      key: 'access',
      header: t('web.col.status'),
      className: 'w-32',
      render: (part) =>
        part.owned ? (
          <Badge label={t('library.owned')} tone="success" />
        ) : part.isPreview ? (
          <Badge label={t('library.preview')} tone="info" />
        ) : (
          <Badge label={t('web.filter')} tone="neutral" />
        ),
    },
    {
      key: 'price',
      header: t('web.col.price'),
      className: 'w-28 text-end font-semibold',
      render: (part) =>
        part.owned || part.isPreview ? (
          <span className="text-muted">{t('common.free')}</span>
        ) : (
          formatMoney({ amount: part.price, currency: part.currency }, language)
        ),
    },
    {
      key: 'actions',
      header: t('web.col.actions'),
      className: 'w-32 text-end',
      render: (part) =>
        part.owned || part.isPreview ? (
          <Button size="sm" variant="secondary" onClick={() => router.push(`/library/reader/${part.id}`)}>
            {t('library.read')}
          </Button>
        ) : part.purchasable ? (
          <Button size="sm" onClick={() => openPurchase('PART', part.id)}>
            {t('library.buy')}
          </Button>
        ) : (
          <span className="text-xs text-subtle">{t('common.no')}</span>
        ),
    },
  ];

  return (
    <AppShell>
      <PageHeader
        title={title}
        breadcrumbs={[{ href: '/library', label: t('library.title') }, { label: title }]}
        meta={material.ownsAllParts ? <Badge label={t('library.ownAll')} tone="success" /> : null}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {material.description ? (
            <Card>
              <CardTitle>{t('courses.aboutCourse')}</CardTitle>
              <p className="text-sm leading-relaxed text-muted">{material.description}</p>
            </Card>
          ) : null}

          {material.packages.length > 0 ? (
            <section>
              <SectionHeading title={t('library.packages')} subtitle={`${formatNumber(material.packages.length, language)}`} />
              <div className="grid gap-3 sm:grid-cols-2">
                {material.packages.map((pkg) => (
                  <Card key={pkg.id} className="flex flex-col justify-between">
                    <div>
                      <div className="text-sm font-bold">{localizedName({ name: pkg.title, nameAr: pkg.titleAr }, language)}</div>
                      <div className="mt-0.5 text-xs text-muted">{formatNumber(pkg.partCount, language)}</div>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-primary-ink">
                        {formatMoney({ amount: pkg.price, currency: pkg.currency }, language)}
                      </span>
                      {pkg.fullyOwned ? (
                        <Badge label={t('library.ownAll')} tone="success" />
                      ) : (
                        <Button size="sm" onClick={() => openPurchase('PACKAGE', pkg.id)}>
                          {t('library.buyPackage')}
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <SectionHeading title={t('library.parts')} subtitle={`${material.parts.length}`} />
            <DataTable
              columns={columns}
              rows={material.parts}
              rowKey={(p) => p.id}
              empty={t('web.noResults')}
              mobile={(part) => (
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{localizedName({ name: part.title, nameAr: part.titleAr }, language)}</div>
                      {part.pageCount ? <div className="text-xs text-muted">{formatNumber(part.pageCount, language)}</div> : null}
                    </div>
                    {part.owned ? (
                      <Badge label={t('library.owned')} tone="success" />
                    ) : part.isPreview ? (
                      <Badge label={t('library.preview')} tone="info" />
                    ) : (
                      <span className="text-sm font-bold text-primary-ink">
                        {formatMoney({ amount: part.price, currency: part.currency }, language)}
                      </span>
                    )}
                  </div>
                  <div className="mt-3">
                    {part.owned || part.isPreview ? (
                      <Button size="sm" variant="secondary" onClick={() => router.push(`/library/reader/${part.id}`)}>
                        {t('library.read')}
                      </Button>
                    ) : part.purchasable ? (
                      <Button size="sm" onClick={() => openPurchase('PART', part.id)}>
                        {t('library.buy')}
                      </Button>
                    ) : null}
                  </div>
                </div>
              )}
            />
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardTitle>{t('web.overview')}</CardTitle>
            <KeyValue label={t('library.packages')}>{formatNumber(material.packages.length, language)}</KeyValue>
            <KeyValue label={t('library.parts')}>{material.parts.length}</KeyValue>
            <KeyValue label={t('web.myLearning')}>
              {material.parts.filter((p) => p.owned).length} / {material.parts.length}
            </KeyValue>
          </Card>
          <Card>
            <p className="text-[13px] leading-relaxed text-muted">{t('library.shortfall')}</p>
            <Button variant="secondary" fullWidth className="mt-3" onClick={() => router.push('/wallet')}>
              {t('wallet.title')}
            </Button>
          </Card>
        </aside>
      </div>

      <Sheet open={pending !== null} onClose={closeSheet} title={t('library.confirmTitle')}>
        {quote.isPending ? (
          <p className="py-8 text-center text-sm text-muted">{t('common.loading')}</p>
        ) : quote.isError ? (
          <ErrorState error={quote.error} compact />
        ) : quote.data ? (
          <div className="flex flex-col gap-3 pb-2">
            <div className="font-bold">{quote.data.title}</div>
            <div className="rounded-lg bg-surface-alt p-3 text-sm">
              <KeyValue label={t('library.price')}>
                {formatMoney({ amount: quote.data.price, currency: quote.data.currency }, language)}
              </KeyValue>
              <KeyValue label={t('wallet.balance')}>
                {formatMoney({ amount: quote.data.balance, currency: quote.data.currency }, language)}
              </KeyValue>
              {!quote.data.sufficientCredit ? (
                <KeyValue label={t('library.shortfall')}>
                  <span className="text-warning">
                    {formatMoney({ amount: quote.data.shortfall, currency: quote.data.currency }, language)}
                  </span>
                </KeyValue>
              ) : null}
            </div>
            {quote.data.fullyOwned ? (
              <p className="text-[13px] text-warning">{t('library.alreadyOwnedBody')}</p>
            ) : quote.data.partsAlreadyOwned > 0 ? (
              <p className="text-[13px] text-warning">
                {t('library.packageOverlap', { owned: quote.data.partsAlreadyOwned, total: quote.data.partCount })}
              </p>
            ) : null}
            {/*
              Same three outcomes as the mobile sheet. Not purchasable (or
              already owned) is said plainly — it used to offer "Top up", which
              sent a student who already owned the item to buy credit.
            */}
            {!quote.data.purchasable || quote.data.fullyOwned ? (
              <p className="text-[13px] text-muted">{t('library.notPurchasable')}</p>
            ) : quote.data.sufficientCredit ? (
              <Button fullWidth loading={purchase.isPending} onClick={confirm}>
                {t('library.confirmBuy', { price: formatMoney({ amount: quote.data.price, currency: quote.data.currency }, language) })}
              </Button>
            ) : (
              <Button fullWidth variant="secondary" onClick={() => { closeSheet(); router.push('/wallet'); }}>
                {t('wallet.topUp')}
              </Button>
            )}
            {purchase.isError ? <ErrorState error={purchase.error} compact /> : null}
          </div>
        ) : null}
      </Sheet>
    </AppShell>
  );
}