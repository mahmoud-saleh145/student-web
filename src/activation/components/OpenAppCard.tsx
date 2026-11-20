'use client';

import * as React from 'react';

import { Button, Card } from '@/components/ui/core';
import { ArrowRightIcon, PhoneIcon } from '@/components/ui/icons';

import { APP_OPEN_TIMEOUT_MS, parseAppLinkConfig, storeUrlFor } from '../lib/app-link';
import { useActivationT } from '../use-t';

/**
 * The link contract, read from the build environment. Unset by default: see
 * `lib/app-link.ts` for what the mobile app supports today and why nothing is
 * hard-coded. These three names are the whole integration surface.
 */
const APP_LINK = parseAppLinkConfig({
  openUrl: process.env.NEXT_PUBLIC_ACTIVATION_APP_URL,
  androidStoreUrl: process.env.NEXT_PUBLIC_ACTIVATION_ANDROID_STORE_URL,
  iosStoreUrl: process.env.NEXT_PUBLIC_ACTIVATION_IOS_STORE_URL,
});

/**
 * "Open Student Center" — the step after an activation.
 *
 * With a configured link the button opens the app. A browser gives no signal
 * when nothing handles the link, so if this page is still visible a moment
 * later the card shows how to get there by hand (and the store, when one is
 * configured). Without a configured link the button shows those steps
 * directly, which is also what a student on a laptop needs.
 *
 * Nothing is passed to the app: no code, no token, no id. The activation is
 * already on the student's account, and the app reads it from the backend.
 */
export function OpenAppCard({ compact }: { compact?: boolean }) {
  const { t } = useActivationT();
  const [showHelp, setShowHelp] = React.useState(false);
  const [storeUrl, setStoreUrl] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setStoreUrl(storeUrlFor(APP_LINK, navigator.userAgent));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const open = () => {
    if (!APP_LINK.openUrl) {
      setShowHelp(true);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (document.visibilityState === 'visible') setShowHelp(true);
    }, APP_OPEN_TIMEOUT_MS);
    window.location.href = APP_LINK.openUrl;
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

      {showHelp ? (
        <div role="status" data-testid="open-app-help" className="mt-3 rounded-lg border border-border bg-surface px-3.5 py-3 text-[13px]">
          <p className="font-semibold">{t('act.app.notOpened')}</p>
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
