/**
 * Cookie names, in a module with no other imports so the edge middleware can
 * read them without pulling in the server configuration.
 */
export const cookieNames = {
  accessToken: 'edu_at',
  refreshToken: 'edu_rt',
  profile: 'edu_pf',
  /**
   * This browser's device identity, as the backend's device binding sees it.
   *
   * Protected content — every playback ticket and every Library document —
   * requires an `X-Device-Id`. Without one the backend answers
   * DEVICE_NOT_AUTHORIZED, which is what made video and documents fail on the
   * web while the rest of the app worked.
   *
   * It is a cookie rather than localStorage because the only thing that talks
   * to the backend is the proxy, which runs on the server and can read cookies
   * but not web storage. HttpOnly for the same reason the tokens are: page
   * scripts have no reason to see it, and it should survive a hostile script
   * the way the session does.
   */
  deviceId: 'edu_did',
} as const;
