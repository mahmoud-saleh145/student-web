'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';

import { useActivationLibraryMaterial, useActivationLibraryPurchase, useActivationLibraryQuote } from '@/activation/api';
import { saveLastActivation } from '@/activation/lib/last-activation';
import { activationRoutes } from '@/activation/lib/routes';
import { useActivationSession } from '@/activation/session';
import { useActivationT } from '@/activation/use-t';
import { LibraryErrorState } from '@/components/library/LibraryErrorState';
import { Badge, Button, Card, CardTitle, KeyValue, Skeleton } from '@/components/ui/core';
import { PageHeader } from '@/components/ui/feedback';
import { Sheet } from '@/components/ui/forms';
import { BookIcon } from '@/components/ui/icons';
import { DataTable, SectionHeading, type Column } from '@/components/ui/table';
import { formatMoney, formatNumber, localizedName } from '@/lib/format';
import { materialView, packageAccess, partAccess, partActions, partOwnership, visibleParts, type LibraryPartAccess } from '@/lib/library';
import type { LibraryPart, LibraryPurchaseKind } from '@/types/domain';

/**
 * One Library material: what it is, what the student holds of it, and — where
 * the backend says a part or bundle is PURCHASABLE — buying it with credit.
 *
 * The page shows exactly the view the backend chose (FULL, or OWNER for a
 * student who owns part of a material they may no longer browse) and decides
 * nothing itself. Buying asks the backend for a quote, shows price and
 * balance, and on confirmation the backend prices the item again, debits the
 * wallet and grants the documents in one transaction. This page never sends a
 * price and never touches the balance.
 *
 * There is NO READER here. An owned part and a free preview are labelled
 * "in the app"; the portal has no route that returns a document, and its proxy
 * does not forward the one backend endpoint that issues them.
 */
export default function ActivationMaterialPage() {
  const params = useParams<{ materialId: string }>();
  const materialId = params.materialId;
  const { t, language } = useActivationT();
  const router = useRouter();
  const { user } = useActivationSession();
  const query = useActivationLibraryMaterial(materialId);
  const quote = useActivationLibraryQuote();
  const purchase = useActivationLibraryPurchase();
  const [pending, setPending] = React.useState<{ kind: LibraryPurchaseKind; targetId: string } | null>(null);
  const buying = React.useRef(false);

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
    if (!pending || buying.current) return;
    buying.current = true;
    try {
      const res = await purchase.mutateAsync(pending);
      if (user) {
        saveLastActivation(window.sessionStorage, user.id, {
          kind: 'library',
          materialId,
          title: res.title,
          partsGranted: res.partsGranted,
          pricePaid: res.alreadyPurchased ? 0 : res.pricePaid,
          balanceAfter: res.balanceAfter,
          currency: res.currency,
          alreadyPurchased: res.alreadyPurchased === true,
        });
      }
      router.push(activationRoutes.success);
    } catch {
      // Shown in the sheet from the mutation's error state.
    } finally {
      buying.current = false;
    }
  };

  const crumbs = (label: string) => [{ href: activationRoutes.library, label: t('library.title') }, { label }];

  if (query.isPending) {
    return (
      <>
        <Skeleton className="h-9 w-64" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Skeleton height={280} />
          <Skeleton height={220} />
        </div>
      </>
    );
  }

  // An error always wins over data: a refetch that is now refused must not
  // leave the previous answer — prices, bundles, other parts — on screen.
  if (query.isError || !query.data) {
    return (
      <>
        <PageHeader title={t('library.title')} breadcrumbs={crumbs('…')} />
        <LibraryErrorState error={query.error} context="material" onRetry={() => void query.refetch()} />
      </>
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

  /** Buy where the server says purchasable; otherwise where the part is read. */
  const actionFor = (part: LibraryPart) => {
    const access = partAccess(part);
    if (partActions(access, view).buy) {
      return (
        <Button size="sm" onClick={() => openPurchase('PART', part.id)} data-testid={`buy-part-${part.id}`}>
          {t('library.buy')}
        </Button>
      );
    }
    if (access === 'OWNED') return <span className="text-[12px] font-semibold text-muted">{t('act.library.inApp')}</span>;
    if (access === 'PREVIEW') return <span className="text-[12px] font-semibold text-muted">{t('act.library.previewInApp')}</span>;
    return null;
  };

  const partTitle = (part: LibraryPart) => (
    <div className="min-w-0">
      <div className="truncate text-sm font-semibold">{localizedName({ name: part.title, nameAr: part.titleAr }, language)}</div>
      {part.pageCount ? (
        <div className="text-xs text-muted">{t('act.library.pages', { count: formatNumber(part.pageCount, language) })}</div>
      ) : null}
    </div>
  );

  const columns: Column<LibraryPart>[] = [
    { key: 'part', header: t('library.parts'), render: partTitle },
    { key: 'access', header: t('act.library.accessStatus'), className: 'w-44', render: (part) => statusBadges(part) },
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
    { key: 'actions', header: t('web.col.actions'), className: 'w-40 text-end', render: (part) => actionFor(part) },
  ];

  return (
    <>
      <PageHeader
        title={title}
        breadcrumbs={crumbs(title)}
        meta={
          <>
            {material.subject ? <Badge label={material.subject.name} tone="neutral" /> : null}
            {material.academicYear ? (
              <Badge label={localizedName({ name: material.academicYear.name, nameAr: material.academicYear.nameAr }, language)} tone="primary" />
            ) : null}
            {!isOwnerView && material.ownsAllParts ? <Badge label={t('library.ownAll')} tone="success" /> : null}
          </>
        }
      />

      {isOwnerView ? (
        <p role="note" data-testid="library-owner-note" className="mb-5 rounded-xl border border-border bg-surface-alt px-4 py-3 text-sm text-muted">
          {t('library.ownerNote')}
        </p>
      ) : null}

      {anyRevoked ? (
        <p role="note" data-testid="library-revoked-note" className="mb-5 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {t('library.revokedNote')}
        </p>
      ) : null}

      <div className={isOwnerView ? 'space-y-6' : 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]'}>
        <div className="min-w-0 space-y-6">
          <Card padded={false} className="overflow-hidden">
            <div className="flex h-40 items-center justify-center overflow-hidden bg-gradient-to-br from-primary-soft to-surface-alt sm:h-52">
              {material.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={material.coverUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <BookIcon size={40} className="text-primary-ink" />
              )}
            </div>
            {material.description ? (
              <div className="p-5">
                <h2 className="text-[15px] font-bold">{t('act.library.about')}</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">{material.description}</p>
              </div>
            ) : null}
          </Card>

          {packages.length > 0 ? (
            <section data-testid="library-packages">
              <SectionHeading title={t('library.packages')} subtitle={formatNumber(packages.length, language)} />
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
                            <Button size="sm" onClick={() => openPurchase('PACKAGE', pkg.id)} data-testid={`buy-package-${pkg.id}`}>
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
            <SectionHeading title={t('library.parts')} subtitle={formatNumber(parts.length, language)} />
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
                      {partTitle(part)}
                      {price ? <span className="shrink-0 text-sm font-bold text-primary-ink">{price}</span> : statusBadges(part)}
                    </div>
                    <div className="mt-3">{actionFor(part)}</div>
                  </div>
                );
              }}
            />
          </section>
        </div>

        {isOwnerView ? null : (
          <aside className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:self-start">
            <Card>
              <CardTitle>{t('web.overview')}</CardTitle>
              {material.subject ? <KeyValue label={t('act.library.subject')}>{material.subject.name}</KeyValue> : null}
              {material.academicYear ? (
                <KeyValue label={t('act.library.yearLevel')}>
                  {localizedName({ name: material.academicYear.name, nameAr: material.academicYear.nameAr }, language)}
                </KeyValue>
              ) : null}
              <KeyValue label={t('library.packages')}>{formatNumber(packages.length, language)}</KeyValue>
              <KeyValue label={t('library.parts')}>{formatNumber(parts.length, language)}</KeyValue>
              <KeyValue label={t('act.library.youOwn')}>
                <span data-testid="library-owned-count">
                  {formatNumber(ownedCount, language)} / {formatNumber(parts.length, language)}
                </span>
              </KeyValue>
            </Card>
            <Card>
              <p className="text-[13px] leading-relaxed text-muted">{t('act.library.creditOnly')}</p>
              <Link
                href={activationRoutes.wallet}
                className="mt-3 flex h-10 w-full items-center justify-center rounded-lg border border-border-strong bg-surface text-sm font-semibold transition hover:bg-surface-alt"
              >
                {t('wallet.title')}
              </Link>
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
          <div className="flex flex-col gap-3 pb-2" data-testid="purchase-sheet">
            <div className="font-bold">{quote.data.title}</div>
            <div className="rounded-lg bg-surface-alt p-3 text-sm">
              <KeyValue label={t('library.price')}>{formatMoney({ amount: quote.data.price, currency: quote.data.currency }, language)}</KeyValue>
              <KeyValue label={t('wallet.balance')}>{formatMoney({ amount: quote.data.balance, currency: quote.data.currency }, language)}</KeyValue>
              {!quote.data.sufficientCredit ? (
                <KeyValue label={t('library.shortfall')}>
                  <span className="text-warning">{formatMoney({ amount: quote.data.shortfall, currency: quote.data.currency }, language)}</span>
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
            {!quote.data.purchasable || quote.data.fullyOwned ? (
              <p className="text-[13px] text-muted">{t('library.notPurchasable')}</p>
            ) : quote.data.sufficientCredit ? (
              <Button fullWidth loading={purchase.isPending} onClick={() => void confirm()} data-testid="purchase-confirm">
                {t('library.confirmBuy', { price: formatMoney({ amount: quote.data.price, currency: quote.data.currency }, language) })}
              </Button>
            ) : (
              // Not enough credit. The only way to add any is a recharge card.
              <Link
                href={activationRoutes.wallet}
                data-testid="purchase-topup"
                className="flex h-10 w-full items-center justify-center rounded-lg border border-border-strong bg-surface text-sm font-semibold transition hover:bg-surface-alt"
              >
                {t('wallet.topUp')}
              </Link>
            )}
            {purchase.isError ? <LibraryErrorState error={purchase.error} context="purchase" compact /> : null}
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
