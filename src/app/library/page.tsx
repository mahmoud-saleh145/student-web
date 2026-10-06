'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Badge, Button, Card, Chip, ProgressBar, Skeleton } from '@/components/ui/core';
import { AppShell, EmptyState, ErrorState, PageHeader } from '@/components/ui/feedback';
import { BookIcon, ChevronRightIcon, FileIcon, SearchIcon, WalletIcon } from '@/components/ui/icons';
import { Toolbar } from '@/components/ui/table';
import { useLibraryBrowse, useMyLibrary, useWallet } from '@/features/api';
import { formatMoney, formatNumber, localizedName } from '@/lib/format';
import { useTranslation } from '@/lib/session-context';
import type { LibraryMaterialSummary, MyLibraryItem } from '@/types/domain';

type Tab = 'browse' | 'mine';

export default function LibraryPage() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>('browse');
  const [raw, setRaw] = React.useState('');
  const [q, setQ] = React.useState('');
  const wallet = useWallet();
  const browse = useLibraryBrowse(q);
  const mine = useMyLibrary();

  React.useEffect(() => {
    const id = setTimeout(() => setQ(raw.trim()), 350);
    return () => clearTimeout(id);
  }, [raw]);

  const ownedByMaterial = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const item of mine.data?.items ?? []) {
      map.set(item.materialId, (map.get(item.materialId) ?? 0) + 1);
    }
    return map;
  }, [mine.data]);

  const isLoading = tab === 'browse' ? browse.isLoading : mine.isLoading;
  const isError = tab === 'browse' ? browse.isError : mine.isError;
  const queryError = tab === 'browse' ? browse.error : mine.error;
  const count = tab === 'browse' ? (browse.data?.items.length ?? 0) : (mine.data?.items.length ?? 0);
  const refetch = () => {
    if (tab === 'browse') void browse.refetch();
    else void mine.refetch();
  };

  const materialTile = (m: LibraryMaterialSummary) => {
    const owned = ownedByMaterial.get(m.id) ?? 0;
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
                {t('library.owned')} · {owned}/{formatNumber(m.partCount, language)}
              </div>
              <ProgressBar percent={(owned / m.partCount) * 100} tone="success" />
            </div>
          ) : null}
        </div>
      </Card>
    );
  };

  const documentTile = (item: MyLibraryItem) => (
    <Card
      key={item.entitlementId}
      padded={false}
      onClick={item.available ? () => router.push(`/library/reader/${item.partId}`) : undefined}
      className={item.available ? 'overflow-hidden' : 'opacity-60'}
    >
      <div className="relative flex h-28 items-center justify-center bg-gradient-to-br from-primary-soft to-surface-alt">
        <FileIcon size={28} className="text-primary-ink" />
        {item.available ? null : (
          <Badge label={t('library.preview')} tone="warning" className="absolute top-2 end-2" />
        )}
      </div>
      <div className="p-4">
        <div className="clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug">
          {localizedName({ name: item.title, nameAr: item.titleAr }, language)}
        </div>
        <div className="mt-0.5 clamp-1 text-[13px] text-muted">{item.materialTitle}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge label={t('library.owned')} tone={item.available ? 'success' : 'neutral'} />
          {item.pageCount ? <span className="text-[13px] text-subtle">{formatNumber(item.pageCount, language)}</span> : null}
        </div>
      </div>
    </Card>
  );

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

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} height={240} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={queryError} onRetry={refetch} />
      ) : tab === 'browse' ? (
        browse.data?.items.length === 0 ? (
          <EmptyState title={t('library.empty.browseTitle')} />
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