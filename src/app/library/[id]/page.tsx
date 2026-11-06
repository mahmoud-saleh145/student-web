'use client';

import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';

import { LibraryErrorState } from '@/components/library/LibraryErrorState';
import { Badge, Button, Card, CardTitle, KeyValue, Skeleton } from '@/components/ui/core';
import { AppShell, PageHeader } from '@/components/ui/feedback';
import { Sheet } from '@/components/ui/forms';
import { DataTable, SectionHeading, type Column } from '@/components/ui/table';
import { useLibraryMaterial, useLibraryPurchase, useLibraryQuote } from '@/features/api';
import { formatMoney, formatNumber, localizedName } from '@/lib/format';
import {
  materialView,
  packageAccess,
  partAccess,
  partActions,
  partOwnership,
  visibleParts,
  type LibraryPartAccess,
} from '@/lib/library';
import { useSession, useTranslation } from '@/lib/session-context';
import { toast } from '@/store/stores';
import type { LibraryPart, LibraryPurchaseKind } from '@/types/domain';

/**
 * One Library material, exactly as the backend chose to show it.
 *
 *   FULL   the student is in the material's audience and the storefront is on:
 *          every published part with its access state, and the packages.
 *   OWNER  the student owns part of it but may not browse it (out of scope, or
 *          the storefront is off): their own parts, a Read button each, and
 *          nothing else — no prices, no packages, no counts, nothing to buy.
 *
 * The page never decides eligibility. Every button comes from the `access`
 * state the server sent, and every ownership label from `ownership` (Decision
 * B: a revoked part may still be offered as a free preview, so the two are
 * shown side by side, never one in place of the other); prices are shown only where the server says the part
 * is PURCHASABLE, and Buy opens a quote that the server can still refuse.
 * Nothing here takes a payment: purchases are drawn from the wallet, which is
 * topped up offline.
 */
export default function LibraryMaterialPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { t, language } = useTranslation();
  const router = useRouter();
  const { status } = useSession();
  const query = useLibraryMaterial(id);
  const quote = useLibraryQuote();
  const purchase = useLibraryPurchase();
  const [pending, setPending] = React.useState<{ kind: LibraryPurchaseKind; targetId: string } | null>(null);

  React.useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  const openPurchase = (kind: LibraryPurchaseKind, targetId: string) => {
    purchase.reset();
    setPending({ kind, targetId });
    quote.mutate({ kind, targetId });
  };

  const closeSheet = () => {
    setPending(null);
    quote.reset();
    purchase.reset();
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

  const openReader = (partId: string, preview: boolean) =>
    router.push(`/library/reader/${partId}${preview ? '?preview=1' : ''}`);

  if (query.isPending || status === 'loading') {
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

  // An error always wins over data: a refetch that is now refused must never
  // leave the previous answer — prices, packages, other parts — on screen.
  if (query.isError || !query.data) {
    return (
      <AppShell>
        <PageHeader title={t('library.title')} back />
        <LibraryErrorState error={query.error} context="material" onRetry={() => void query.refetch()} />
      </AppShell>
    );
  }

  const material = query.data;
  const view = materialView(material);
  const isOwnerView = view === 'OWNER';
  const parts = visibleParts(material.parts, view);
  const packages = isOwnerView ? [] : material.packages;
  const anyRevoked = !isOwnerView && parts.some((part) => partOwnership(part) === 'REVOKED');
  const ownedCount = parts.filter((part) => partAccess(part) === 'OWNED').length;
  const title = localizedName({ name: material.title, nameAr: material.titleAr }, language);

  const accessBadge = (access: LibraryPartAccess) => {
    switch (access) {
      case 'OWNED':
        return <Badge label={t('library.owned')} tone="success" />;
      case 'PREVIEW':
        return <Badge label={t('library.preview')} tone="info" />;
      case 'REVOKED':
        return <Badge label={t('library.access.revoked')} tone="danger" />;
      case 'UNAVAILABLE':
        return <Badge label={t('library.access.unavailable')} tone="neutral" />;
      default:
        return null;
    }
  };

  // What the student can do (`access`) and, when it differs, what happened to
  // their copy (`ownership`). A revoked part offered as a free preview shows
  // both: "Free preview" and "Ownership revoked".
  const statusBadges = (part: LibraryPart) => {
    const access = partAccess(part);
    const revokedBeside = access !== 'REVOKED' && partOwnership(part) === 'REVOKED';
    return (
      <div className="flex flex-wrap gap-1" data-testid={`library-part-status-${part.id}`}>
        {accessBadge(access)}
        {revokedBeside ? accessBadge('REVOKED') : null}
      </div>
    );
  };

  const priceOf = (part: LibraryPart) =>
    partAccess(part) === 'PURCHASABLE' && typeof part.price === 'number'
      ? formatMoney({ amount: part.price, currency: part.currency ?? 'EGP' }, language)
      : null;

  const actionsFor = (part: LibraryPart) => {
    const actions = partActions(partAccess(part), view);
    if (actions.read) {
      return (
        <Button size="sm" variant="secondary" onClick={() => openReader(part.id, actions.preview)}>
          {t('library.read')}
        </Button>
      );
    }
    if (actions.buy) {
      return (
        <Button size="sm" onClick={() => openPurchase('PART', part.id)}>
          {t('library.buy')}
        </Button>
      );
    }
    return null;
  };

  const columns: Column<LibraryPart>[] = [
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
      className: 'w-44',
      render: (part) => statusBadges(part),
    },
    // The owner view carries no prices at all, so it has no price column.
    ...(isOwnerView
      ? []
      : [
          {
            key: 'price',
            header: t('web.col.price'),
            className: 'w-28 text-end font-semibold',
            render: (part: LibraryPart) => priceOf(part) ?? <span className="text-subtle">—</span>,
          },
        ]),
    {
      key: 'actions',
      header: t('web.col.actions'),
      className: 'w-32 text-end',
      render: (part) => actionsFor(part),
    },
  ];

  return (
    <AppShell>
      <PageHeader
        title={title}
        breadcrumbs={[{ href: '/library', label: t('library.title') }, { label: title }]}
        meta={!isOwnerView && material.ownsAllParts ? <Badge label={t('library.ownAll')} tone="success" /> : null}
      />

      {isOwnerView ? (
        <p
          role="note"
          data-testid="library-owner-note"
          className="mb-5 rounded-xl border border-border bg-surface-alt px-4 py-3 text-sm text-muted"
        >
          {t('library.ownerNote')}
        </p>
      ) : null}

      {anyRevoked ? (
        <p
          role="note"
          data-testid="library-revoked-note"
          className="mb-5 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {t('library.revokedNote')}
        </p>
      ) : null}

      <div className={isOwnerView ? 'space-y-6' : 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]'}>
        <div className="space-y-6">
          {material.description ? (
            <Card>
              <CardTitle>{t('courses.aboutCourse')}</CardTitle>
              <p className="text-sm leading-relaxed text-muted">{material.description}</p>
            </Card>
          ) : null}

          {packages.length > 0 ? (
            <section data-testid="library-packages">
              <SectionHeading title={t('library.packages')} subtitle={`${formatNumber(packages.length, language)}`} />
              <div className="grid gap-3 sm:grid-cols-2">
                {packages.map((pkg) => {
                  const access = packageAccess(pkg);
                  return (
                    <Card key={pkg.id} className="flex flex-col justify-between">
                      <div>
                        <div className="text-sm font-bold">{localizedName({ name: pkg.title, nameAr: pkg.titleAr }, language)}</div>
                        <div className="mt-0.5 text-xs text-muted">
                          {t('library.parts')} · {formatNumber(pkg.partCount, language)}
                        </div>
                        {access === 'PURCHASABLE' && pkg.partsAlreadyOwned > 0 ? (
                          <div className="mt-1 text-xs text-warning">
                            {t('library.packageOverlap', { owned: pkg.partsAlreadyOwned, total: pkg.partCount })}
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-2">
                        {access === 'OWNED' ? (
                          <Badge label={t('library.ownAll')} tone="success" />
                        ) : access === 'PURCHASABLE' ? (
                          <>
                            <span className="text-sm font-bold text-primary-ink">
                              {formatMoney({ amount: pkg.price, currency: pkg.currency }, language)}
                            </span>
                            <Button size="sm" onClick={() => openPurchase('PACKAGE', pkg.id)}>
                              {t('library.buyPackage')}
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-muted">{t('library.packageUnavailable')}</span>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section data-testid="library-parts">
            <SectionHeading
              title={t('library.parts')}
              // A count of what is listed; in the owner view that is only what
              // the student owns, never the material's total.
              subtitle={`${formatNumber(parts.length, language)}`}
            />
            <DataTable
              columns={columns}
              rows={parts}
              rowKey={(p) => p.id}
              empty={t('web.noResults')}
              mobile={(part) => {
                const price = isOwnerView ? null : priceOf(part);
                return (
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{localizedName({ name: part.title, nameAr: part.titleAr }, language)}</div>
                        {part.pageCount ? <div className="text-xs text-muted">{formatNumber(part.pageCount, language)}</div> : null}
                      </div>
                      {price ? <span className="text-sm font-bold text-primary-ink">{price}</span> : statusBadges(part)}
                    </div>
                    <div className="mt-3">{actionsFor(part)}</div>
                  </div>
                );
              }}
            />
          </section>
        </div>

        {isOwnerView ? null : (
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <Card>
              <CardTitle>{t('web.overview')}</CardTitle>
              <KeyValue label={t('library.packages')}>{formatNumber(packages.length, language)}</KeyValue>
              <KeyValue label={t('library.parts')}>{formatNumber(parts.length, language)}</KeyValue>
              <KeyValue label={t('web.myLearning')}>
                {formatNumber(ownedCount, language)} / {formatNumber(parts.length, language)}
              </KeyValue>
            </Card>
            <Card>
              <p className="text-[13px] leading-relaxed text-muted">{t('library.shortfall')}</p>
              <Button variant="secondary" fullWidth className="mt-3" onClick={() => router.push('/wallet')}>
                {t('wallet.title')}
              </Button>
            </Card>
          </aside>
        )}
      </div>

      <Sheet open={pending !== null} onClose={closeSheet} title={t('library.confirmTitle')}>
        {quote.isPending ? (
          <p className="py-8 text-center text-sm text-muted">{t('common.loading')}</p>
        ) : quote.isError ? (
          <LibraryErrorState error={quote.error} context="purchase" compact />
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
              sent a student who already owned the item to buy credit. "Top
              up" goes to the wallet, whose only way in is an offline recharge
              card: there is no online payment anywhere in this flow.
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
            {purchase.isError ? <LibraryErrorState error={purchase.error} context="purchase" compact /> : null}
          </div>
        ) : null}
      </Sheet>
    </AppShell>
  );
}
