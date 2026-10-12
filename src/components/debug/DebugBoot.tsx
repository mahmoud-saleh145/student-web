'use client';

import * as React from 'react';

import { debugErrorToken, debugGate, PRODUCTION_HOSTS, type DebugRecord } from '@/lib/debug/gate';
import { setDebugSink } from '@/lib/debug/sink';

/**
 * Boots the temporary FairPlay debug console (Eruda).
 *
 * SECURITY POSTURE - read before changing anything here
 *
 * Eruda is an in-page inspector that exposes the DOM, storage, cookies,
 * console output and XHR/fetch traffic. On an app whose licence requests carry a
 * signed token and an SPC body, running it in Production would be a serious
 * vulnerability. It must be impossible to switch on outside an explicitly
 * authorised Vercel Preview deployment.
 *
 * WHY A QUERY PARAMETER IS NOT THE BOUNDARY
 *
 * `?debug=1` is user-controlled: any production visitor could append one. That
 * is not a security boundary. The boundary is the BUILD:
 *
 *   1. `NEXT_PUBLIC_FAIRPLAY_DEBUG=1` is set in Vercel's Preview environment
 *      scope only, so it is undefined in a Production build and the gate refuses.
 *   2. `next.config.ts` swaps `eruda` for a no-op stub in any build without the
 *      flag, so Eruda is not even present to import. Check 1 alone is NOT
 *      sufficient: Next compiles an unset `NEXT_PUBLIC_*` variable to a member
 *      lookup rather than a literal, so this branch is NOT statically dead and
 *      webpack emits the library anyway. That was measured - see
 *      next.config.ts and eruda-bundling.test.ts before changing either.
 *   3. the hostname is checked at runtime against the production aliases.
 *   4. the hostname must be a per-deployment `*.vercel.app` domain or loopback.
 *
 * WHY THE NETWORK TOOL IS DISABLED
 *
 * Eruda's Network panel renders the full request URL, headers and body. For
 * this app that means the signed licence URL (`?token=...&expires=...`) and the
 * `{"spc":"<base64>"}` body would be displayed verbatim in the inspector. That
 * is exactly what must never be exposed, so only the Console tool is enabled.
 * Network visibility comes from Safari Web Inspector plus the redacted records
 * emitted here - see the report for why Eruda could not see the native media
 * requests anyway.
 *
 * NOTE ON THE API: eruda 3.x has no `addLog`. Records are published with
 * `console.info`, which the Console tool captures by design. `show` and
 * `position` (eruda.d.ts) drive the banner's "Open console" button and move the
 * entry button to the top-left.
 *
 * VISIBLE BANNER: when (and only when) the gate passes, a fixed high-contrast
 * banner reading `FAIRPLAY DEBUG ENABLED` is rendered at the top, before Eruda
 * is even loaded, and it reports Eruda's load state. No banner on a device
 * therefore means the gate refused (no build flag, or a production host).
 */
type ErudaStatus = { state: 'loading' | 'ready' } | { state: 'failed'; error: string };

type ErudaApi = {
  init: (options: Record<string, unknown>) => void;
  show: (name?: string) => unknown;
  position: (p: { x: number; y: number }) => unknown;
};

/**
 * Height reserved for the banner. Eruda's entry button is moved just below it,
 * top-left, instead of its default bottom-right corner, which sits under
 * iOS Safari's toolbar and home indicator.
 */
const BANNER_HEIGHT_PX = 44;

export function DebugBoot() {
  // `null` = gate refused (Production, or a build without the flag): nothing is
  // rendered at all. Only a passed gate ever reaches the banner below.
  const [status, setStatus] = React.useState<ErudaStatus | null>(null);
  const erudaRef = React.useRef<ErudaApi | null>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const gate = debugGate({
      buildFlag: process.env.NEXT_PUBLIC_FAIRPLAY_DEBUG,
      host: window.location.hostname,
    });
    // Disabled is the Production state: stay completely silent there. The
    // reason is still available to tests through `debugGate()` itself.
    if (!gate.allowed) return;

    // The banner is shown BEFORE Eruda is loaded, from this same confirmed
    // path, so a device report can separate "gate refused / no build flag"
    // (no banner) from "gate passed but Eruda failed" (banner says why).
    setStatus({ state: 'loading' });

    let cancelled = false;

    void (async () => {
      try {
        const eruda = (await import('eruda')).default as unknown as ErudaApi;
        if (cancelled) return;

        eruda.init({
          // Console ONLY. See the class comment for why Network is excluded.
          tool: ['console'],
          autoScale: true,
          useShadowDom: true,
        });
        // Top-left, below the banner: reachable on iPhone whatever the toolbar.
        eruda.position({ x: 8, y: BANNER_HEIGHT_PX + 8 });
        erudaRef.current = eruda;

        setDebugSink((record: DebugRecord) => {
          const parts = [`[fp:${record.k}]`];
          if (record.v !== undefined) parts.push(String(record.v));
          if (record.n !== undefined) parts.push(`n=${record.n}`);
          if (record.t !== undefined) parts.push(`t=${Math.round(record.t)}ms`);
          console.info(parts.join(' '));
        });

        console.info(`[fp-debug] enabled (${gate.reason})`);
        setStatus({ state: 'ready' });
      } catch (error) {
        console.warn('[fp-debug] failed to load; in-app diagnostics still work');
        if (!cancelled) setStatus({ state: 'failed', error: debugErrorToken(error) });
      }
    })();

    return () => {
      cancelled = true;
      erudaRef.current = null;
      setDebugSink(null);
    };
  }, []);

  if (!status) return null;

  const label =
    status.state === 'failed' ? `eruda: failed (${status.error})` : `eruda: ${status.state}`;

  return (
    <div
      role="status"
      data-fairplay-debug-banner={status.state}
      dir="ltr"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 2147483647,
        minHeight: BANNER_HEIGHT_PX,
        paddingTop: 'env(safe-area-inset-top)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        paddingLeft: 12,
        paddingRight: 12,
        background: '#ffeb3b',
        color: '#000',
        font: '700 13px/1.2 ui-monospace, Menlo, monospace',
        boxShadow: '0 2px 0 #000',
      }}
    >
      <span>FAIRPLAY DEBUG ENABLED · {label}</span>
      <button
        type="button"
        disabled={status.state !== 'ready'}
        // `show()` with NO argument opens the panel. `show('console')` only
        // switches tools (eruda 3.4.3: `e ? showTool(e) : show()`) and leaves the
        // panel closed. Console is the only tool enabled, so it opens on it.
        onClick={() => erudaRef.current?.show()}
        style={{
          padding: '6px 10px',
          background: '#000',
          color: '#ffeb3b',
          border: 0,
          borderRadius: 4,
          font: 'inherit',
          opacity: status.state === 'ready' ? 1 : 0.4,
        }}
      >
        Open console
      </button>
    </div>
  );
}

/** Re-exported so tests can assert the production deny-list is populated. */
export { PRODUCTION_HOSTS };
