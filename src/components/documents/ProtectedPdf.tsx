'use client';

import * as React from 'react';

import { burnWatermark } from '@/components/protection/Watermark';
import { useTranslation } from '@/lib/session-context';

/**
 * A purchased document, drawn rather than handed over.
 *
 * The reader used to point an `<iframe>` at the signed URL. The browser then
 * rendered it with its own PDF viewer — which carries a Download button and a
 * Print button, and whose address is one right-click away. Every protection
 * around the document (a short-lived URL bound to one viewer, the watermark,
 * the device binding behind it) ended at a toolbar the platform does not own.
 *
 * pdf.js reads the bytes and paints each page onto a canvas instead. There is
 * no file for the browser to offer, no viewer chrome, and no object URL left
 * behind: the bytes are fetched once, rendered, and dropped. A determined
 * reader can still photograph the screen — that is true of paper too — but the
 * easy path of pressing Save is gone.
 *
 * The worker is loaded from the app's own origin rather than a CDN, so the
 * document never depends on a third party being up or honest.
 */
export function ProtectedPdf({ url, watermark }: { url: string; watermark: string }) {
  const { t } = useTranslation();
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [state, setState] = React.useState<'loading' | 'ready' | 'failed'>('loading');
  const [pages, setPages] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();

        // No credentials: the URL is bound to this viewer by its signature, and
        // asking for credentials on a cross-origin read would demand a stricter
        // CORS contract from the edge for no gain.
        const doc = await pdfjs.getDocument({ url, withCredentials: false }).promise;
        if (cancelled) return;

        host.replaceChildren();
        setPages(doc.numPages);

        // Draw above CSS resolution so the text stays sharp when the reader
        // zooms, but capped: a tall page at full device pixel ratio can exceed
        // the browser's canvas limit and silently render nothing at all.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (let n = 1; n <= doc.numPages; n += 1) {
          const page = await doc.getPage(n);
          if (cancelled) return;

          const base = page.getViewport({ scale: 1 });
          const width = host.clientWidth || 800;
          const viewport = page.getViewport({ scale: (width / base.width) * dpr });

          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className = 'mb-3 block h-auto w-full rounded-lg bg-white shadow-sm';
          host.appendChild(canvas);

          const context = canvas.getContext('2d');
          if (!context) continue;
          await page.render({ canvasContext: context, viewport }).promise;
          burnWatermark(context, canvas.width, canvas.height, watermark, dpr);
        }

        if (!cancelled) setState('ready');
      } catch {
        if (!cancelled) setState('failed');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, watermark]);

  return (
    <div className="relative" data-protected>
      <div
        ref={hostRef}
        aria-label={t('library.read')}
        className="select-none"
        style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
      />

      {state === 'loading' ? (
        <p className="py-20 text-center text-sm text-muted">{t('library.opening')}</p>
      ) : null}

      {state === 'failed' ? (
        <p className="py-20 text-center text-sm text-danger">{t('errors.genericBody')}</p>
      ) : null}

      {state === 'ready' && pages > 0 ? (
        <span
          aria-hidden
          className="pointer-events-none fixed bottom-6 end-6 select-none rounded bg-black/45 px-2 py-1 text-[11px] font-semibold text-white"
        >
          {watermark}
        </span>
      ) : null}
    </div>
  );
}
