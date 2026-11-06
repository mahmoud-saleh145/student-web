'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { ProtectedPdf } from '@/components/documents/ProtectedPdf';
import { LibraryErrorState } from '@/components/library/LibraryErrorState';
import { FocusShell } from '@/components/ui/feedback';
import { useOpenDocument } from '@/features/api';
import { readerLoadFailure } from '@/lib/library';
import { useTranslation } from '@/lib/session-context';

/**
 * The Library reader.
 *
 * Everything that decides whether this document opens happens on the server:
 * `POST library/parts/:id/open` checks the entitlement (or, for a free preview,
 * the student's scope and the storefront), the device binding, and mints a
 * short-lived URL bound to this user, session and device. The media gate then
 * re-checks that ticket on every fetch. This page only asks for a ticket and
 * draws what comes back; it never sees, builds or edits a ticket id or a
 * storage key, and there is no fallback to any other URL.
 *
 * `?preview=1` is set by the material page when it opened a free preview, so a
 * refusal can say "this preview isn't available" instead of "you haven't
 * bought this". It changes the wording only, never what is requested.
 */
export default function LibraryReaderPage() {
  return (
    <React.Suspense fallback={null}>
      <LibraryReader />
    </React.Suspense>
  );
}

function LibraryReader() {
  const params = useParams<{ id: string }>();
  const partId = params.id;
  const preview = useSearchParams().get('preview') === '1';
  const { t } = useTranslation();
  const router = useRouter();
  const open = useOpenDocument();
  const requested = React.useRef(false);
  const [reopens, setReopens] = React.useState(0);

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
  const reopen = () => {
    if (!partId) return;
    setReopens((count) => count + 1);
    open.mutate(partId);
  };

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
        <LibraryErrorState error={open.error} context={preview ? 'preview' : 'reader'} onRetry={reopen} />
      </FocusShell>
    );
  }

  const ticket = open.data;
  return (
    <FocusShell title={ticket.title} backHref="/library">
      <div className="overflow-hidden rounded-xl border border-border bg-surface-alt p-3" style={{ minHeight: '72vh' }}>
        <ProtectedPdf
          url={ticket.url}
          watermark={ticket.watermark.primary}
          secondary={ticket.watermark.secondary}
          onReopen={reopen}
          describeFailure={(status) => readerLoadFailure({ status, preview, reopens })}
        />
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
