# Activation portal (`/activate`)

An activation-only student portal inside the student web app: browse courses
and the library, redeem access codes, top up credit with a recharge card, buy
library materials — and nothing else. Lessons are watched and documents are
read in the Student Center mobile app; the portal has no player, no reader and
no route that can return protected content.

It is an additive route tree in the same repository and the same deployment.
The learning website (`/home`, `/courses`, `/lessons`, `/player`, `/library`,
…) is unchanged.

## Routes

| Route | Purpose |
|---|---|
| `/activate` | Portal home: the five destinations and how activation reaches the app |
| `/activate/login` | Sign-in with the existing Student Center phone number and password |
| `/activate/courses` | Course catalogue, with the backend's visibility and the same display filters |
| `/activate/courses/[courseId]` | Course information, outline, parts and prices, and the activation panel |
| `/activate/library` | Library catalogue, as the backend scopes it |
| `/activate/library/[materialId]` | Material details, access status, purchase with credit |
| `/activate/wallet` | Balance, ledger, recharge-card redemption |
| `/activate/my-activations` | Activated courses (with their true extent) and owned library documents |
| `/activate/account` | Profile (read-only), language, theme, sign out |
| `/activate/success` | Receipt for the activation just made, and "Open Student Center" |
| `/api/activate/auth/login`, `/logout` | The portal's own session |
| `/api/activate/proxy/[...path]` | The portal's allow-listed backend proxy (GET and POST only) |

Any other address under `/activate` renders the portal's own not-found page.

## Where the code lives

```
src/activation/                  everything portal-specific
  lib/      pure logic, each with a node:test file beside it
            routes · proxy-allowlist · ownership · errors · last-activation
            app-link · same-origin · cookie-names · client
  server/   route-handler helpers: session cookies, refresh coordination, responses
  components/  ActivationShell · CourseActivationCard · ActivationCourseCard · OpenAppCard
  api.ts    data hooks (portal proxy, portal query keys)
  session.tsx  portal session context + its own QueryClient
  i18n.ts   the portal's English and Arabic strings
src/app/activate/                pages (own layout; `(portal)` group adds the shell)
src/app/api/activate/            the portal's route handlers
e2e/activation/                  browser tests
e2e/support/activation-backend.mjs   stateful stand-in backend for those tests
```

## Isolation from the learning website

**Session.** The portal has its own cookies — `edu_act_at`, `edu_act_rt`,
`edu_act_pf` — written and read only by `/api/activate/*`. It never reads
`edu_at` / `edu_rt` / `edu_pf` / `edu_did`. Being signed in to one tree is not
being signed in to the other, and signing out of one does not touch the other.

**Not a playback device.** The backend binds a device on sign-in only when the
request carries `X-Device-Id` (`DevicesService.resolveOnLogin`). The learning
website sends one; the portal sends none, on sign-in or on any other request.
With no header the backend writes nothing about devices — no device row, no
device-change request, no device event — and the session has `deviceId = null`.
(It does write the ordinary `LOGIN_SUCCESS` audit entry every sign-in writes,
with no device on it.) The
student's device allowance and their phone's binding are untouched. A new
sign-in does not end other sessions, so the phone stays signed in; sign-out
calls `/auth/logout` (that session only), never `/auth/logout-all`.

**No protected content.** `/api/activate/proxy` is an allow-list
(`src/activation/lib/proxy-allowlist.ts`). A path not written there is answered
`403 PATH_NOT_ALLOWED` and never forwarded. Lesson detail, playback tickets,
manifests and keys, attachment tickets, `library/parts/:id/open`, devices and
session management are not in it. The pages mirror that: lessons and files are
rows of text, with no links or buttons.

**Routing.** `src/middleware.ts` decides `/activate/**` first, with the portal's
own rule (portal cookie, else `/activate/login`). A portal visitor is never
redirected to `/login`, and `next` after sign-in is honoured only inside
`/activate`. No portal page links to a learning-website page.

**Data.** The portal has its own `QueryClient`; every key carries the signed-in
user. Nothing is shared with the learning website's cache.

## What the portal shares with the rest of the app

These are the dependencies to keep when the learning website's pages change.

| Shared | Used for |
|---|---|
| `src/app/layout.tsx`, `globals.css`, `providers.tsx` | `<html>`, fonts, design tokens, before-paint theme/direction, toast host |
| `src/middleware.ts` | Hosts the portal's gate (first branch) |
| `src/components/ui/*`, `components/brand/BrandLogo`, `components/library/LibraryErrorState` | Buttons, cards, badges, forms, sheet, table, page header, error and empty states |
| `src/i18n/dictionaries.ts`, `src/store/stores.ts` | Shared strings; language, theme and toast stores |
| `src/lib/session-context.tsx` (`useTranslation` only) | Read by the shared UI components |
| `src/lib/api-client.ts` (`createApiClient`, `ApiError`) | Request and error handling, bound to the portal's proxy |
| `src/lib/session.ts` (`backendRequest`), `config`, `errors`, `locale`, `web-request` | Server-side calls to the backend; CSRF marker header |
| `src/lib/refresh-lock.ts` (types and two pure predicates) | Refresh outcome type |
| `src/lib/course-access.ts`, `features/curriculum.ts`, `lib/library.ts`, `lib/format.ts`, `lib/error-messages.ts`, `features/schemas.ts` | Business rules shared with the learning website: which ways in are offered, part/section grouping, library access states, formatting, error wording, phone validation |
| `src/types/*` | Backend response types |

Changes made to shared files for the portal (all additive):

- `middleware.ts` — the `/activate` branch.
- `lib/api-client.ts` — `createApiClient(base)`; `api` is `createApiClient('/api/proxy')`, unchanged in behaviour.
- `lib/session-end.ts`, `lib/session-context.tsx` — the learning website's session bootstrap and session-end redirect do nothing on `/activate` paths.
- `i18n/dictionaries.test.ts` — the "every key is defined" guard also accepts portal keys.

## Backend endpoints used

All existing; no backend change, no migration.

`POST /auth/login`, `/auth/refresh`, `/auth/logout` · `GET /auth/me`, `/profile` ·
`GET /catalog/academic-years` (and the other public catalog lists) ·
`GET /courses`, `/courses/mine`, `/courses/:id`, `/courses/:id/parts`, `/courses/:id/join-options` ·
`POST /codes/validate`, `/courses/:id/redeem`, `/courses/:id/enroll` (`FREE` / `ADMIN_APPROVAL` only) ·
`GET /library/materials`, `/library/materials/:id`, `/library/me` · `POST /library/quote`, `/library/purchase` ·
`GET /wallet`, `/wallet/transactions` · `POST /wallet/redeem`

Entitlements are the backend's: the same `Enrollment`, section grants,
`CoursePartEntitlement`, `LibraryEntitlement` and wallet ledger the mobile app
reads. The portal stores no entitlement of its own. The success screen's
receipt (`sessionStorage`, this tab only) is display text, never a code.

## Activation behaviour worth knowing

- A course code is redeemed against the course the student opened
  (`POST /courses/:id/redeem`); the card's own scope decides what it unlocks.
- The redeem response does not say what was unlocked, so the portal reads
  ownership before and after and reports the difference.
- A part or section card for something already held grants nothing. A backend
  with the duplicate-card fix (student-backend, branch
  `fix/duplicate-scope-card-redeem`) refuses it inside the redemption
  transaction with `409 ALREADY_ENROLLED` and leaves the card unspent; the
  portal then says "You already have everything this card unlocks. Your card
  was not used." A backend WITHOUT that fix consumes the card. So, before
  redeeming, the portal still calls `/codes/validate` (read-only) and asks
  first when the card might duplicate a part or section the student already
  holds — that prompt is what protects the card until the backend fix is live,
  and can be removed afterwards. A student who owns every part is offered no
  code box at all — the same rule as the learning website's join sheet.
- "Full course" is shown only on the backend's `fullCourse.owned`. Owning every
  part one by one is shown as "2 of 2 parts".
- Library materials are bought with wallet credit only. There are no library
  access codes; a course code typed into the wallet (or a recharge card typed
  on a course) is refused by the backend and the portal says where it belongs.
- Credit is added only by an administration-issued recharge card
  (`POST /wallet/redeem`) or by the administration. There is no payment
  provider anywhere in the portal.

## Returning to the mobile app

The mobile app today (audited 2026-11-20) declares a custom URL scheme only —
`eduplatform` in production — with no universal links, no Android App Links,
no inbound-URL handling and no recorded store listing. Nothing is hard-coded
here. The "Open Student Center" button is driven by three optional build-time
variables:

```
NEXT_PUBLIC_ACTIVATION_APP_URL=          # e.g. eduplatform://  or an https app link
NEXT_PUBLIC_ACTIVATION_ANDROID_STORE_URL=  # https://play.google.com/store/apps/details?id=…
NEXT_PUBLIC_ACTIVATION_IOS_STORE_URL=      # https://apps.apple.com/…
```

Unset (the default), the button explains how to return to the app by hand.
With a link set, it opens the app and falls back to those instructions (and
the store, if configured) when the page is still visible a moment later. The
link may not carry a query string or fragment — no code, token or id travels
to the app; the app reads entitlements from the backend.

The app refetches on return to foreground once cached data is older than 60 s
(course detail 120 s); otherwise the student pulls to refresh.

For a future mobile task: add `android.intentFilters` (`autoVerify`) and
`ios.associatedDomains` for the portal's host, serve `/.well-known/assetlinks.json`
and `apple-app-site-association` from this app, and invalidate course/library
queries when the app is opened from the link.

## Disabling the learning website later (not done)

The portal is built so this is a small, contained change:

1. In `src/middleware.ts`, answer every non-`/activate` page with a redirect to
   `/activate` (or a notice page). The `/activate` branch is already first and
   independent.
2. Remove or block `src/app/api/proxy` and `src/app/api/auth` — the portal uses
   neither.
3. Trim `src/app/providers.tsx` to theme/direction/toast (drop the learning
   website's `SessionProvider`); move `useTranslation` out of
   `lib/session-context.tsx`.
4. Delete the learning pages and their libraries (player, DRM, PDF reader).
   Keep the shared rows in the table above.
5. Point `src/app/page.tsx` and `not-found.tsx` at `/activate`.

Both trees share one deployment: an outage of the deployment, of the backend,
or of a shared module affects both. The independence is at the route level.

## Running and testing

```
node e2e/support/activation-dev.mjs          # portal on :4711 against the stand-in backend
npm test                                     # unit tests (src/activation/**/*.test.ts included)
npx playwright test -c playwright.activation.config.ts   # browser tests
```

The stand-in backend holds fixture students, courses, cards and wallets only.

### Against the real backend

`e2e/activation-real/` runs the same portal against the backend's actual code —
its auth and device rules, validation, rate limits, Serializable redemption and
wallet ledger — on a throwaway local Postgres and Redis, with a dedicated
fixture student and cards generated through the backend's own admin API. One
serial story: the phone signs in first, the student then uses the portal, and
the backend's database and the phone's session are checked after each step.

```
# containers and environment: see e2e/activation-real/backend-env.sh
. e2e/activation-real/backend-env.sh
export BACKEND_DIR=<checkout of student-backend: npm ci, prisma generate, nest build; no .env file>
(cd "$BACKEND_DIR" && npx prisma migrate deploy && node dist/src/main.js) &
node e2e/activation-real/seed.cjs          # empties the *_test database, then seeds it
npx playwright test -c playwright.activation-real.config.ts
```

The seed and the helpers refuse any database, Redis or backend address that is
not on this machine, and any database whose name does not end in `_test`.
There is no staging backend; these tests must never be pointed at production.
Re-seed before every run.
