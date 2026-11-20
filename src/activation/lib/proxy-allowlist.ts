/**
 * Every backend route the activation portal may reach — and nothing else.
 *
 * The learning website's proxy is a block-list: it forwards any path that is
 * not explicitly refused, because that site legitimately needs lessons,
 * playback tickets, attachments and the PDF reader. The portal is the
 * opposite. It exists to show the catalogue and to activate, so its proxy is
 * an ALLOW-list: a path that is not written down here is never forwarded.
 *
 * That is what makes "no protected content through the portal" a property of
 * the server rather than of the pages. There is no lesson detail, no playback
 * ticket, no attachment ticket and no `library/parts/:id/open` in this list,
 * so no page, script or hand-written request to `/api/activate/proxy/*` can
 * obtain a manifest, a DRM licence, a signed PDF URL or a reader token —
 * whatever a future page in this tree might try to do.
 *
 * Adding a route here is a decision to expose it. Exact shapes only: a prefix
 * match would quietly admit whatever the backend mounts under it next.
 *
 * Pure and dependency-free so it runs under `node --test`.
 */

export type ActivationMethod = 'GET' | 'POST';

interface Rule {
  method: ActivationMethod;
  path: RegExp;
}

const ID = '[A-Za-z0-9_-]{1,64}';
const rx = (pattern: string) => new RegExp(`^${pattern}$`);

/**
 * Words that sit where an id would in `courses/:id` or `library/materials/:id`
 * but name a different backend surface. `mine` has its own rule; the rest are
 * staff routes the backend guards anyway.
 */
const RESERVED_IDS = new Set(['admin', 'mine', 'students', 'export', 'internal']);

const RULES: readonly Rule[] = [
  // Who is signed in, and their academic profile (drives the year/level filter).
  { method: 'GET', path: rx('auth/me') },
  { method: 'GET', path: rx('profile') },

  // Academic structure, as the catalogue filters read it.
  { method: 'GET', path: rx('catalog/universities') },
  { method: 'GET', path: rx(`catalog/universities/${ID}/faculties`) },
  { method: 'GET', path: rx(`catalog/faculties/${ID}/departments`) },
  { method: 'GET', path: rx('catalog/academic-years') },
  { method: 'GET', path: rx('catalog/academic-selection') },

  // Course catalogue and course information. `courses/:id` carries the outline
  // (section and lesson titles, durations, lock flags) and attachment names —
  // metadata only: no video id, no URL, no object key.
  { method: 'GET', path: rx('courses') },
  { method: 'GET', path: rx('courses/mine') },
  { method: 'GET', path: rx(`courses/${ID}`) },
  { method: 'GET', path: rx(`courses/${ID}/join-options`) },
  { method: 'GET', path: rx(`courses/${ID}/parts`) },

  // Course activation.
  { method: 'POST', path: rx('codes/validate') },
  { method: 'POST', path: rx(`courses/${ID}/redeem`) },
  { method: 'POST', path: rx(`courses/${ID}/enroll`) },

  // Library catalogue, ownership and wallet purchase. No `parts/:id/open`.
  { method: 'GET', path: rx('library/materials') },
  { method: 'GET', path: rx(`library/materials/${ID}`) },
  { method: 'GET', path: rx('library/me') },
  { method: 'POST', path: rx('library/quote') },
  { method: 'POST', path: rx('library/purchase') },

  // Wallet: balance, ledger, and the recharge-card redemption.
  { method: 'GET', path: rx('wallet') },
  { method: 'GET', path: rx('wallet/transactions') },
  { method: 'POST', path: rx('wallet/redeem') },
];

export function normalizeActivationPath(path: string): string {
  return path.replace(/^\/+|\/+$/g, '');
}

export function isAllowedActivationRequest(method: string, path: string): boolean {
  const normalized = normalizeActivationPath(path);
  if (normalized.includes('..') || normalized.includes('//') || normalized.includes('%')) return false;

  const segments = normalized.split('/');
  // `courses/:id…` and `library/materials/:id` — an id slot holding a reserved word.
  const idSlot = segments[0] === 'courses' ? segments[1] : segments[0] === 'library' && segments[1] === 'materials' ? segments[2] : undefined;
  if (idSlot !== undefined && RESERVED_IDS.has(idSlot.toLowerCase()) && normalized !== 'courses/mine') return false;

  return RULES.some((rule) => rule.method === method && rule.path.test(normalized));
}

/**
 * The self-enrolment methods the portal may send. Online payment is never one
 * of them: the platform takes no card payments, and the portal must not be the
 * place one is started.
 */
export const ALLOWED_ENROLL_METHODS: ReadonlySet<string> = new Set(['FREE', 'ADMIN_APPROVAL']);

/**
 * Body-level rule for the one allowed route whose body chooses a mechanism.
 * Returns false when the request must be refused.
 */
export function isAllowedActivationBody(path: string, body: unknown): boolean {
  const normalized = normalizeActivationPath(path);
  if (!/^courses\/[A-Za-z0-9_-]+\/enroll$/.test(normalized)) return true;
  const method = (body as { method?: unknown } | null | undefined)?.method;
  return typeof method === 'string' && ALLOWED_ENROLL_METHODS.has(method);
}

/** Portal answers are per student and change on activation: never stored. */
export const ACTIVATION_CACHE_CONTROL = 'private, no-store';
