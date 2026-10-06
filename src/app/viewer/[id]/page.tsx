'use client';

import { useParams } from 'next/navigation';
import * as React from 'react';

import { FocusShell, ErrorState } from '@/components/ui/feedback';
import { useAttachmentTicket } from '@/features/api';
import { ProtectedPdf } from '@/components/documents/ProtectedPdf';
import { Watermark } from '@/components/protection/Watermark';
import { useTranslation } from '@/lib/session-context';

export default function ViewerPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { t } = useTranslation();
  const query = useAttachmentTicket(id, true);

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

  return (
    <FocusShell title={t('courses.materials')}>
      {query.isLoading ? (
        <p className="py-20 text-center text-sm text-muted">{t('player.authorizing')}</p>
      ) : query.isError || !query.data ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <ViewerBody url={query.data.url} watermark={query.data.watermark.primary} secondary={query.data.watermark.secondary} />
      )}
    </FocusShell>
  );
}

function ViewerBody({ url, watermark, secondary }: { url: string; watermark: string; secondary?: string }) {
  const { t } = useTranslation();
  const base = (url.split('?')[0] ?? '').toLowerCase();
  const isPdf = base.endsWith('.pdf');
  const isImage = /\.(png|jpe?g|webp|gif)$/.test(base);
  if (isPdf) {
    // Same reasoning as the Library reader: an iframe hands the document to the
    // browser's PDF viewer, Download button and all.
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-surface-alt p-3" style={{ minHeight: '72vh' }}>
        <ProtectedPdf url={url} watermark={watermark} />
      </div>
    );
  }
  if (isImage) {
    return (
      <div data-protected className="relative overflow-hidden rounded-xl border border-border bg-surface-alt">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="attachment" className="mx-auto max-h-[75vh] select-none" draggable={false} />
        <Watermark primary={watermark} secondary={secondary} />
      </div>
    );
  }
  // Word, Excel and other formats a browser cannot draw. The mobile viewer
  // shows these inside a locked web view that refuses downloads
  // (`onFileDownload` is a no-op, no cache, incognito). Handing the browser
  // the signed URL instead — as this page used to — downloads an
  // unwatermarked copy of paid material to the student's disk. So the web
  // says plainly that it cannot open the file here, rather than giving it away.
  return (
    <div className="mx-auto max-w-md rounded-xl border border-border bg-surface p-6 text-center">
      <p className="text-[15px] font-bold">{t('viewer.unsupportedTitle')}</p>
      <p className="mt-2 text-sm text-muted">{t('viewer.unsupportedBody')}</p>
    </div>
  );
}
