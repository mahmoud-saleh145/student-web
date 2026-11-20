/**
 * The activation portal's own session cookies.
 *
 * Deliberately NOT the learning website's `edu_at` / `edu_rt` / `edu_pf`. The
 * two are different kinds of session:
 *
 *   - the learning website signs in WITH a device identity (`edu_did`), which
 *     the backend binds as the student's playback device;
 *   - the portal signs in WITHOUT one. It is not a playback device, so it must
 *     never register as one or take the slot the student's phone needs.
 *
 * Sharing the cookies would let a device-less portal session leak into the
 * learning website (where every video and document would then be refused as
 * "device not authorised"), and would let a portal sign-out end the student's
 * web session. Separate names keep each tree's session its own, and are what
 * lets the learning website be switched off later without touching this one.
 *
 * There is no portal device-id cookie, on purpose.
 *
 * No imports, so the edge middleware can read the names.
 */
export const activationCookieNames = {
  accessToken: 'edu_act_at',
  refreshToken: 'edu_act_rt',
  profile: 'edu_act_pf',
} as const;
