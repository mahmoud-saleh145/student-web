'use client';

import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';

import { ProtectedPdf } from '@/components/documents/ProtectedPdf';
import { ErrorState, FocusShell } from '@/components/ui/feedback';
import { useOpenDocument } from '@/features/api';
import { useTranslation } from '@/lib/session-context';

export default function LibraryReaderPage() {
  const params = useParams<{ id: string }>();
  const partId = params.id;
  const { t } = useTranslation();
  const router = useRouter();
  const open = useOpenDocument();
  const requested = React.useRef(false);

  React.useEffect(() => {
    if (!partId || requested.current) return;
    requested.current = true;
    open.mutate(partId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partId]);

  React.useEffect(() => {
    const onCopy = (e: ClipboardEvent) => e.preventDefault();
    const onContext = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('copy', onCopy);
    document.addEventListener('contextmenu', onContext);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('contextmenu', onContext);
    };
  }, []);

  const close = () => (window.history.length > 1 ? router.back() : router.replace('/library'));

  if (open.isPending || (!open.data && !open.isError)) {
    return (
      <FocusShell title={t('library.opening')} backHref="/library">
        <p className="py-20 text-center text-sm text-muted">{t('library.opening')}</p>
      </FocusShell>
    );
  }
  if (open.isError || !open.data) {
    return (
      <FocusShell title={t('library.opening')} backHref="/library">
        <ErrorState error={open.error} onRetry={() => partId && open.mutate(partId)} />
      </FocusShell>
    );
  }

  const ticket = open.data;
  return (
    <FocusShell title={ticket.title} backHref="/library">
      <div className="overflow-hidden rounded-xl border border-border bg-surface-alt p-3" style={{ minHeight: '72vh' }}>
        <ProtectedPdf url={ticket.url} watermark={ticket.watermark.primary} />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          onClick={close}
          className="h-10 cursor-pointer rounded-lg border border-border bg-surface px-4 text-sm font-semibold transition hover:bg-surface-alt"
        >
          {t('common.back')}
        </button>
        <span className="text-xs text-subtle">{t('player.protectedNotice')}</span>
      </div>
    </FocusShell>
  );
}
