'use client';

import * as React from 'react';

import { debugGate, PRODUCTION_HOSTS, type DebugRecord } from '@/lib/debug/gate';
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
 * NOTE ON THE API: eruda 3.x exposes `init`/`get`/`destroy` only - there is no
 * `addLog`. Records are published with `console.info`, which the Console tool
 * captures by design.
 */
export function DebugBoot() {
  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const gate = debugGate({
      buildFlag: process.env.NEXT_PUBLIC_FAIRPLAY_DEBUG,
      host: window.location.hostname,
    });
    // Disabled is the Production state: stay completely silent there. The
    // reason is still available to tests through `debugGate()` itself.
    if (!gate.allowed) return;

    let cancelled = false;

    void (async () => {
      try {
        const eruda = (await import('eruda')).default;
        if (cancelled) return;

        eruda.init({
          // Console ONLY. See the class comment for why Network is excluded.
          tool: ['console'],
          autoScale: true,
          useShadowDom: true,
        });

        setDebugSink((record: DebugRecord) => {
          const parts = [`[fp:${record.k}]`];
          if (record.v !== undefined) parts.push(String(record.v));
          if (record.n !== undefined) parts.push(`n=${record.n}`);
          if (record.t !== undefined) parts.push(`t=${Math.round(record.t)}ms`);
          console.info(parts.join(' '));
        });

        console.info(`[fp-debug] enabled (${gate.reason})`);
      } catch {
        console.warn('[fp-debug] failed to load; in-app diagnostics still work');
      }
    })();

    return () => {
      cancelled = true;
      setDebugSink(null);
    };
  }, []);

  // Renders nothing. Eruda mounts its own panel into the document.
  return null;
}

/** Re-exported so tests can assert the production deny-list is populated. */
export { PRODUCTION_HOSTS };
