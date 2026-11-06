'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { LibraryErrorState } from '@/components/library/LibraryErrorState';
import { Badge, Button, Card, Chip, ProgressBar, Skeleton } from '@/components/ui/core';
import { AppShell, EmptyState, PageHeader } from '@/components/ui/feedback';
import { BookIcon, ChevronRightIcon, FileIcon, SearchIcon, WalletIcon } from '@/components/ui/icons';
import { Toolbar } from '@/components/ui/table';
import { useLibraryBrowse, useMyLibrary, useWallet } from '@/features/api';
import { formatMoney, formatNumber, localizedName } from '@/lib/format';
import { myLibraryStatus } from '@/lib/library';
import { useTranslation } from '@/lib/session-context';
import type { LibraryAcademicYear, LibraryMaterialSummary, MyLibraryItem } from '@/types/domain';

type Tab = 'browse' | 'mine';

/**
 * The Library: what the student may browse, and what they own.
 *
 * Browse lists exactly what the backend returns for this student — materials of
 * their own faculty (all of its departments, General and Programs alike) or of
 * their department. The page adds nothing and hides nothing on top of that.
 * While the storefront is switched off the backend returns an empty list; the
 * page then says nothing is available and points to My documents, which is
 * independent of the storefront and of academic scope.
 *
 * The year/level chips are a browse filter sent to the backend. They never
 * hide anything the student owns: My documents ignores them.
 */
export default function LibraryPage() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>('browse');
  const [raw, setRaw] = React.useState('');
  const [q, setQ] = React.useState('');
  const [yearId, setYearId] = React.useState('');
  const wallet = useWallet();
  const browse = useLibraryBrowse(q, yearId || undefined);
  const mine = useMyLibrary();

  React.useEffect(() => {
    const id = setTimeout(() => setQ(raw.trim()), 350);
    return () => clearTimeout(id);
  }, [raw]);

  // Year/level choices come only from materials the backend already returned
  // to this student, collected while no year filter is applied — so a choice
  // never names a rung of a material they cannot see.
  const [years, setYears] = React.useState<LibraryAcademicYear[]>([]);
  React.useEffect(() => {
    if (yearId || !browse.data) return;
    const seen = new Map<string, LibraryAcademicYear>();
    for (const m of browse.data.items) if (m.academicYear) seen.set(m.academicYear.id, m.academicYear);
    setYears([...seen.values()]);
  }, [browse.data, yearId]);

  // Fallback for a backend that predates `ownedPartCount`: count from the
  // first page of My documents, as this page always did.
  const ownedByMaterial = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const item of mine.data?.items ?? []) {
      map.set(item.materialId, (map.get(item.materialId) ?? 0) + 1);
    }
    return map;
  }, [mine.data]);

  const isLoading = tab === 'browse' ? browse.isPending : mine.isPending;
  const isError = tab === 'browse' ? browse.isError : mine.isError;
  const queryError = tab === 'browse' ? browse.error : mine.error;
  const count = tab === 'browse' ? (browse.data?.items.length ?? 0) : (mine.data?.items.length ?? 0);
  const refetch = () => {
    if (tab === 'browse') void browse.refetch();
    else void mine.refetch();
  };
  const ownsSomething = (mine.data?.items.length ?? 0) > 0;

  const materialTile = (m: LibraryMaterialSummary) => {
    const owned = m.ownedPartCount ?? ownedByMaterial.get(m.id) ?? 0;
    const fullyOwned = m.partCount > 0 && owned >= m.partCount;
    return (
      <Card key={m.id} onClick={() => router.push(`/library/${m.id}`)} padded={false} className="overflow-hidden">
        <div className="relative flex h-28 items-center justify-center overflow-hidden bg-gradient-to-br from-primary-soft to-surface-alt">
          {m.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <BookIcon size={30} className="text-primary-ink" />
          )}
          {fullyOwned ? (
            <Badge label={t('library.owned')} tone="success" className="absolute top-2 end-2" />
          ) : null}
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
              <span className="text-[13px] font-bold text-primary-ink">
                {formatMoney({ amount: m.priceFrom, currency: 'EGP' }, language)}
              </span>
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
      </Card>
    );
  };

  const documentTile = (item: MyLibraryItem) => {
    const readable = myLibraryStatus(item) === 'READABLE';
    return (
      <Card
        key={item.entitlementId}
        padded={false}
        onClick={readable ? () => router.push(`/library/reader/${item.partId}`) : undefined}
        className={readable ? 'overflow-hidden' : 'opacity-60'}
      >
        <div className="relative flex h-28 items-center justify-center bg-gradient-to-br from-primary-soft to-surface-alt">
          <FileIcon size={28} className="text-primary-ink" />
          {readable ? null : (
            <Badge label={t('library.withdrawn')} tone="warning" className="absolute top-2 end-2" />
          )}
        </div>
        <div className="p-4">
          <div className="clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug">
            {localizedName({ name: item.title, nameAr: item.titleAr }, language)}
          </div>
          <div className="mt-0.5 clamp-1 text-[13px] text-muted">{item.materialTitle}</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge label={t('library.owned')} tone={readable ? 'success' : 'neutral'} />
            {item.pageCount ? <span className="text-[13px] text-subtle">{formatNumber(item.pageCount, language)}</span> : null}
          </div>
        </div>
      </Card>
    );
  };

  return (
    <AppShell>
      <PageHeader
        title={t('library.title')}
        subtitle={t('library.browseSubtitle')}
        action={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => router.push('/wallet')}
          >
            <WalletIcon size={16} />
            {wallet.isLoading
              ? '…'
              : wallet.data
                ? formatMoney({ amount: wallet.data.balance, currency: wallet.data.currency }, language)
                : '…'}
          </Button>
        }
      />

      <Toolbar>
        {tab === 'browse' ? (
          <div className="relative w-full max-w-sm">
            <SearchIcon size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={t('library.searchPlaceholder')}
              aria-label={t('library.searchPlaceholder')}
              className="h-10 w-full rounded-lg border border-border-strong bg-surface ps-9 pe-3 text-sm outline-none transition placeholder:text-subtle focus:border-primary"
            />
          </div>
        ) : null}
        <div className={tab === 'browse' ? 'ms-auto flex flex-wrap items-center gap-2' : 'flex flex-wrap items-center gap-2'}>
          <Chip label={t('library.tabBrowse')} selected={tab === 'browse'} onClick={() => setTab('browse')} />
          <Chip label={t('library.tabMine')} selected={tab === 'mine'} onClick={() => setTab('mine')} />
        </div>
        <span className="text-[13px] text-muted">{t('web.resultsCount', { count })}</span>
      </Toolbar>

      {tab === 'browse' && years.length > 0 ? (
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

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} height={240} />
          ))}
        </div>
      ) : isError ? (
        <LibraryErrorState error={queryError} context="browse" onRetry={refetch} />
      ) : tab === 'browse' ? (
        browse.data?.items.length === 0 ? (
          q || yearId ? (
            <EmptyState title={t('web.noResults')} />
          ) : (
            // Says the same thing whether the storefront is off or nothing is
            // offered to this student: the backend does not say which, and the
            // page must not guess.
            <EmptyState
              title={t('library.storefront.emptyTitle')}
              body={t('library.storefront.emptyBody')}
              actionLabel={ownsSomething ? t('library.storefront.openMine') : undefined}
              onAction={ownsSomething ? () => setTab('mine') : undefined}
            />
          )
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {(browse.data?.items ?? []).map(materialTile)}
            </div>
            {browse.hasNextPage ? (
              <div className="mt-6 flex justify-center">
                <Button variant="secondary" onClick={() => void browse.fetchNextPage()}>
                  {t('common.seeAll')}
                  <ChevronRightIcon size={15} />
                </Button>
              </div>
            ) : null}
          </>
        )
      ) : mine.data?.items.length === 0 ? (
        <EmptyState
          title={t('library.empty.mineTitle')}
          body={t('library.empty.mineBody')}
          actionLabel={t('library.tabBrowse')}
          onAction={() => setTab('browse')}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {(mine.data?.items ?? []).map(documentTile)}
          </div>
          {mine.hasNextPage ? (
            <div className="mt-6 flex justify-center">
              <Button variant="secondary" onClick={() => void mine.fetchNextPage()}>
                {t('common.seeAll')}
                <ChevronRightIcon size={15} />
              </Button>
            </div>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
