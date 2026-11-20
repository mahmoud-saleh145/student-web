'use client';

import Link from 'next/link';
import * as React from 'react';

import { useActivationLibraryBrowse, useActivationMyLibrary, useActivationWallet } from '@/activation/api';
import { activationRoutes } from '@/activation/lib/routes';
import { useActivationT } from '@/activation/use-t';
import { LibraryErrorState } from '@/components/library/LibraryErrorState';
import { Badge, Button, Chip, ProgressBar, Skeleton } from '@/components/ui/core';
import { EmptyState, InlineNote, PageHeader } from '@/components/ui/feedback';
import { BookIcon, ChevronRightIcon, SearchIcon, WalletIcon } from '@/components/ui/icons';
import { Toolbar } from '@/components/ui/table';
import { formatMoney, formatNumber, localizedName } from '@/lib/format';
import type { LibraryAcademicYear, LibraryMaterialSummary } from '@/types/domain';

/**
 * The Library catalogue, as the backend offers it to this student.
 *
 * Organisation, classification and visibility are the backend's and are the
 * same as on the learning website: materials of the student's own faculty
 * (General and Programs departments alike) or of their department, each with
 * its subject, its year or level, its parts and its prices. The year/level
 * chips are a browse filter built only from materials the backend already
 * returned. While the storefront is switched off the backend returns nothing,
 * and the page says nothing is available — it does not guess why.
 *
 * What differs from the learning website is the destination: a material opens
 * its portal page (details and purchase with credit), never a reader. The
 * student's own documents are listed on My activations.
 */
export default function ActivationLibraryPage() {
  const { t, language } = useActivationT();
  const [raw, setRaw] = React.useState('');
  const [q, setQ] = React.useState('');
  const [yearId, setYearId] = React.useState('');
  const wallet = useActivationWallet();
  const browse = useActivationLibraryBrowse(q, yearId || undefined);
  const mine = useActivationMyLibrary();

  React.useEffect(() => {
    const id = setTimeout(() => setQ(raw.trim()), 350);
    return () => clearTimeout(id);
  }, [raw]);

  // Year/level choices come only from materials the backend already returned
  // to this student, collected while no year filter is applied.
  const [years, setYears] = React.useState<LibraryAcademicYear[]>([]);
  React.useEffect(() => {
    if (yearId || !browse.data) return;
    const seen = new Map<string, LibraryAcademicYear>();
    for (const m of browse.data.items) if (m.academicYear) seen.set(m.academicYear.id, m.academicYear);
    setYears([...seen.values()]);
  }, [browse.data, yearId]);

  const items = browse.data?.items ?? [];
  const ownsSomething = (mine.data?.items.length ?? 0) > 0;

  return (
    <>
      <PageHeader
        title={t('library.title')}
        subtitle={t('act.library.subtitle')}
        breadcrumbs={[{ href: activationRoutes.home, label: t('act.nav.home') }, { label: t('library.title') }]}
        action={
          <Link
            href={activationRoutes.wallet}
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-semibold transition hover:bg-surface-alt"
            data-testid="library-balance"
          >
            <WalletIcon size={16} />
            {wallet.data ? formatMoney({ amount: wallet.data.balance, currency: wallet.data.currency }, language) : '…'}
          </Link>
        }
      />

      <div className="mb-5">
        <InlineNote>
          {t('act.library.creditOnly')} {t('act.library.noCodeNote')}
        </InlineNote>
      </div>

      <Toolbar>
        <div className="relative w-full max-w-sm">
          <SearchIcon size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={t('library.searchPlaceholder')}
            aria-label={t('library.searchPlaceholder')}
            type="search"
            className="h-10 w-full rounded-lg border border-border-strong bg-surface ps-9 pe-3 text-sm outline-none transition placeholder:text-subtle focus:border-primary"
          />
        </div>
        <span className="ms-auto text-[13px] text-muted">{t('web.resultsCount', { count: items.length })}</span>
      </Toolbar>

      {years.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="library-year-filter">
          <Chip label={t('library.filter.allYears')} selected={!yearId} onClick={() => setYearId('')} />
          {years.map((year) => (
            <Chip
              key={year.id}
              label={localizedName({ name: year.name, nameAr: year.nameAr }, language)}
              selected={yearId === year.id}
              onClick={() => setYearId(year.id)}
            />
          ))}
        </div>
      ) : null}

      {browse.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} height={240} />
          ))}
        </div>
      ) : browse.isError ? (
        <LibraryErrorState error={browse.error} context="browse" onRetry={() => void browse.refetch()} />
      ) : items.length === 0 ? (
        q || yearId ? (
          <EmptyState title={t('web.noResults')} />
        ) : (
          // The same words whether the storefront is off or nothing is offered
          // to this student: the backend does not say which.
          <div data-testid="library-empty">
            <EmptyState title={t('library.storefront.emptyTitle')} body={t('library.storefront.emptyBody')} />
            {ownsSomething ? (
              <div className="mt-4 flex justify-center">
                <Link href={activationRoutes.myActivations} className="text-[13px] font-semibold text-primary-ink underline-offset-4 hover:underline">
                  {t('act.library.ownedDocs')}
                </Link>
              </div>
            ) : null}
          </div>
        )
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((m) => (
              <MaterialTile key={m.id} material={m} />
            ))}
          </div>
          {browse.hasNextPage ? (
            <div className="mt-6 flex justify-center">
              <Button variant="secondary" onClick={() => void browse.fetchNextPage()} loading={browse.isFetchingNextPage}>
                {t('common.seeAll')}
                <ChevronRightIcon size={15} />
              </Button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

function MaterialTile({ material: m }: { material: LibraryMaterialSummary }) {
  const { t, language } = useActivationT();
  const owned = m.ownedPartCount ?? 0;
  const fullyOwned = m.partCount > 0 && owned >= m.partCount;

  return (
    <Link
      href={activationRoutes.material(m.id)}
      data-testid="material-tile"
      className="block overflow-hidden rounded-xl border border-border bg-surface text-start transition hover:border-border-strong hover:bg-surface-alt/60"
    >
      <div className="relative flex h-28 items-center justify-center overflow-hidden bg-gradient-to-br from-primary-soft to-surface-alt">
        {m.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <BookIcon size={30} className="text-primary-ink" />
        )}
        {fullyOwned ? <Badge label={t('library.owned')} tone="success" className="absolute top-2 end-2" /> : null}
      </div>
      <div className="p-4">
        <div className="clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug">
          {localizedName({ name: m.title, nameAr: m.titleAr }, language)}
        </div>
        <div className="mt-0.5 truncate text-[13px] text-muted">{m.subject?.name ?? t('library.title')}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge label={`${t('library.parts')} · ${formatNumber(m.partCount, language)}`} tone="neutral" />
          {m.academicYear ? (
            <Badge label={localizedName({ name: m.academicYear.name, nameAr: m.academicYear.nameAr }, language)} tone="primary" />
          ) : null}
          {m.priceFrom !== null ? (
            <span className="text-[13px] font-bold text-primary-ink">{formatMoney({ amount: m.priceFrom, currency: 'EGP' }, language)}</span>
          ) : (
            <span className="text-[13px] font-bold text-success">{t('common.free')}</span>
          )}
        </div>
        {!fullyOwned && owned > 0 && m.partCount > 0 ? (
          <div className="mt-3">
            <div className="mb-1 text-[13px] text-muted">
              {t('library.owned')} · {formatNumber(owned, language)}/{formatNumber(m.partCount, language)}
            </div>
            <ProgressBar percent={(owned / m.partCount) * 100} tone="success" />
          </div>
        ) : null}
      </div>
    </Link>
  );
}
