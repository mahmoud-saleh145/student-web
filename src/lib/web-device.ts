import type { NextRequest } from 'next/server';

import { getDeviceId } from './session';
import { newDeviceId } from './session-cookies';

/**
 * The browser's identity for the backend's device binding.
 *
 * The binding happens on sign-in: the backend reads `X-Device-Id` from that
 * request and, on a first device, binds it. A browser that signed in without
 * the header was never registered at all, so every later request for protected
 * content was refused — which is why video and Library documents failed on the
 * web while everything else worked.
 *
 * The identity is created here if the browser has none, and the caller is told
 * so it can persist the cookie on its response.
 */
export async function resolveDeviceIdentity(
  request: NextRequest
): Promise<{ deviceId: string; isNew: boolean; device: { name: string; model: string; osVersion: string } }> {
  const existing = await getDeviceId();
  const userAgent = request.headers.get('user-agent') ?? '';

  return {
    deviceId: existing ?? newDeviceId(),
    isNew: existing === null,
    device: describeBrowser(userAgent),
  };
}

/**
 * A human label for the device list an administrator reviews.
 *
 * Intentionally coarse: the browser family and the platform, nothing that
 * narrows down an individual. It exists so a change request reads
 * "Chrome · Windows" instead of a bare identifier — not to fingerprint anyone.
 */
export function describeBrowser(userAgent: string): {
  name: string;
  model: string;
  osVersion: string;
} {
  const browser =
    /edg\//i.test(userAgent) ? 'Edge'
    : /opr\/|opera/i.test(userAgent) ? 'Opera'
    : /chrome|chromium/i.test(userAgent) ? 'Chrome'
    : /firefox/i.test(userAgent) ? 'Firefox'
    : /safari/i.test(userAgent) ? 'Safari'
    : 'Browser';

  const os =
    /windows/i.test(userAgent) ? 'Windows'
    : /android/i.test(userAgent) ? 'Android'
    : /iphone|ipad|ipod/i.test(userAgent) ? 'iOS'
    : /mac os/i.test(userAgent) ? 'macOS'
    : /linux/i.test(userAgent) ? 'Linux'
    : 'Unknown';

  return { name: `${browser} · ${os}`, model: browser, osVersion: os };
}
