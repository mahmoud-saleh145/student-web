'use client';

import * as React from 'react';

import { Button, Card } from '@/components/ui/core';
import { ArrowRightIcon, PhoneIcon } from '@/components/ui/icons';

import { APP_OPEN_TIMEOUT_MS, isPhoneOrTablet, parseAppLinkConfig, storeUrlFor } from '../lib/app-link';
import { useActivationT } from '../use-t';

/**
 * The link contract. `eduplatform://` is built in (`lib/app-link.ts`); the
 * build environment can replace it or switch it off, and can add the store
 * listings once they are known. These three names are the whole integration
 * surface.
 */
const APP_LINK = parseAppLinkConfig({
  openUrl: process.env.NEXT_PUBLIC_ACTIVATION_APP_URL,
  androidStoreUrl: process.env.NEXT_PUBLIC_ACTIVATION_ANDROID_STORE_URL,
  iosStoreUrl: process.env.NEXT_PUBLIC_ACTIVATION_IOS_STORE_URL,
});

/** Why the manual steps are showing. */
type Help = 'not-opened' | 'on-phone';

/**
 * "Open Student Center" — the step after an activation.
 *
 * On a phone or tablet the button opens the app through its own URL scheme,
 * directly from the tap (browsers only honour an app link that comes from a
 * real gesture). A browser gives no signal when nothing answers the scheme, so
 * the card watches instead: if the page went to the background, the app
 * opened; if it is still in front a moment later, the manual steps appear (and
 * the store, when one is configured). The portal itself is never left in a
 * broken state either way.
 *
 * On a computer there is no app to open, so the button goes straight to the
 * steps: open the app on your phone.
 *
 * Nothing is passed to the app: no code, no token, no id. The activation is
 * already on the student's account, and the app reads it from the backend with
 * the session it already has.
 */
export function OpenAppCard({ compact }: { compact?: boolean }) {
  const { t } = useActivationT();
  const [help, setHelp] = React.useState<Help | null>(null);
  const [storeUrl, setStoreUrl] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The page went to the background after the tap: the app took over. */
  const leftPage = React.useRef(false);

  React.useEffect(() => {
    setStoreUrl(storeUrlFor(APP_LINK, navigator.userAgent));

    const cancel = () => {
      leftPage.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      // The system's "Open in Student Center?" sheet can outlast the wait, so
      // the steps may already be showing when the app does take over. They
      // were not needed after all: do not leave them for the student's return.
      setHelp((current) => (current === 'not-opened' ? null : current));
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') cancel();
    };
    // Not `blur`: the system sheet that says an address cannot be opened also
    // blurs the page, and that is exactly when the steps are needed.
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', cancel);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', cancel);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const open = () => {
    const url = APP_LINK.openUrl;
    if (!url || !isPhoneOrTablet(navigator.userAgent, navigator.maxTouchPoints)) {
      setHelp(url ? 'on-phone' : 'not-opened');
      return;
    }

    leftPage.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (!leftPage.current && document.visibilityState === 'visible') setHelp('not-opened');
    }, APP_OPEN_TIMEOUT_MS);

    // Synchronously inside the tap, so the browser treats it as the student's
    // own navigation. The link is the bare scheme: nothing is appended to it.
    window.location.href = url;
  };

  return (
    <Card className={compact ? undefined : 'border-primary-border bg-primary-soft/40'}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-fg">
          <PhoneIcon size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold">{t('act.app.title')}</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">{t('act.app.body')}</p>
        </div>
      </div>

      <Button fullWidth size="lg" className="mt-4" onClick={open} data-testid="open-app">
        {t('act.app.open')}
        {/* Points forward in both directions: the icon mirrors itself in RTL. */}
        <ArrowRightIcon size={16} />
      </Button>

      {help ? (
        <div
          role="status"
          data-testid="open-app-help"
          data-help={help}
          className="mt-3 rounded-lg border border-border bg-surface px-3.5 py-3 text-[13px]"
        >
          <p className="font-semibold">{t(help === 'on-phone' ? 'act.app.onPhone' : 'act.app.notOpened')}</p>
          {storeUrl ? (
            <a
              href={storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex font-semibold text-primary-ink underline-offset-4 hover:underline"
            >
              {t('act.app.getApp')}
            </a>
          ) : null}
        </div>
      ) : null}

      <p className="mt-3 text-[12px] leading-relaxed text-subtle">{t('act.app.refresh')}</p>
    </Card>
  );
}
