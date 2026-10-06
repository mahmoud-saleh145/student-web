# edu-web — Student Web Frontend

Standalone Next.js 15 web app reproducing the mobile app's student-facing functionality in the browser. Reuses the existing backend **without changes**.

## Quick start

```bash
cd edu-web
cp .env.example .env.local   # set API_BASE_URL to your backend, e.g. http://localhost:3000/api/v1
npm install
npm run dev                  # http://localhost:3002
```

Production:

```bash
npm run build
npm start                    # http://localhost:3002
```

Checks: `npm run typecheck`, `npm run lint`, `npm run verify` (typecheck + lint + build).

## Architecture

- **Next.js 15 App Router + React 19 + Tailwind CSS v4 + TanStack Query v5 + react-hook-form + zod** — same stack and conventions as `edu-dashboard`.
- **Server-side API proxy** (`src/app/api/proxy/[...path]`): the browser never talks to the backend directly. Tokens live in HTTP-only cookies (`edu_at`, `edu_rt`, `edu_pf`); the proxy attaches `Authorization: Bearer` server-side, retries once via `/auth/refresh` on 401, and re-checks CSRF (`x-web-request: 1`). This also avoids all CORS issues.
- **Auth routes**: `/api/auth/login`, `/api/auth/register`, `/api/auth/logout`, `/api/auth/session`.
- **i18n**: English + Arabic dictionaries (`src/i18n/dictionaries.ts`, ported from the mobile `en.json`/`ar.json` keys) with RTL layout switching and persisted language/theme/player preferences (zustand).
- **Design tokens**: Tailwind v4 `@theme` palette ported from the mobile `palette.ts` (light + dark).

## Screens (all inside `edu-web`)

Auth: `/login`, `/register` (3-step wizard), `/password-help` · Tabs: `/home`, `/courses`, `/my-courses`, `/search`, `/notifications`, `/profile` · Detail: `/courses/[id]` (overview/content/materials + join sheet with enroll + access-code redeem + code validation), `/lessons/[id]` (completion rule, manual complete, attachments, prev/next), `/player/[videoId]` (ticket → hls.js HLS, heartbeat, progress save, ticket release, watermark overlay, allowance warning, autoplay), `/viewer/[attachmentId]` (ticketed PDF/image viewer with watermark) · Library: `/library`, `/library/[id]` (quote → purchase sheet), `/library/reader/[id]` · `/wallet` (balance, recharge-card redeem, transactions) · Support: `/support`, `/support/new`, `/support/[id]` · Settings: `/settings`, `/language`, `/playback`, `/notifications` (server preferences), `/security`, `/devices`, `/about`, `/delete-account` (via support ticket) · `/profile/edit` (name + avatar via presigned storage upload).

## Deliberate web adaptations (vs mobile)

- Push notifications: not available on web — notification preferences for in-app content remain; no push-token registration.
- Content protection: no secure surface / screenshot blocking / device integrity in browsers. Server-side enforcement (signed expiring URLs, watermark, concurrency slots, play limits) is unchanged; the web shows a notice instead of blocking.
- Native-only features not ported: offline cache persistence, OS badge count, app updates, share/copy sheets.

## Blocked by unavailable APIs

None — every student-facing feature the mobile app uses is backed by an existing backend endpoint and implemented here. Admin-only operations (user management, course authoring, code generation) are out of scope for the student web app.
