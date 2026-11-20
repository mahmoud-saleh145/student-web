// A stand-in for the Student Center backend, for the activation portal's tests.
//
// It answers the routes the portal uses with the response shapes, status codes
// and error codes of the real backend (`edu-backend`, audited 2026-11-20), and
// it keeps state — sessions, enrolments, part ownership, cards, wallets — so a
// test can redeem a card and then read the ownership that produced, the way a
// student would. Nothing here is a real account, a real card or real money.
//
// It also plays the parts of the backend the portal must NEVER touch: device
// binding and the protected-content routes (lesson detail, playback tickets,
// attachment tickets, the Library reader). They work here, and every hit is
// recorded, so a test can prove the portal produced none.
//
// Rules transcribed from the backend rather than invented:
//   * unknown body or query fields are refused with 422 (forbidNonWhitelisted)
//   * sign-in binds a device only when `X-Device-Id` is present
//   * course visibility is the student's university + faculty + department
//   * a card's scope comes from the card, never from the request
//   * a PART / SECTION card for something already held is refused with
//     ALREADY_ENROLLED and left unspent, as a whole-course owner's card is
//   * redeem answers `{ state, courseId }` and does not say what it unlocked
//   * library items are bought with wallet credit only; recharge is by card
//
// Control surface (tests only): POST /__test/reset, GET /__test/state,
// POST /__test/set, POST /__test/expire-access.

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.ACTIVATION_BACKEND_PORT ?? 4712);
const PREFIX = '/api/v1';
const PASSWORD = 'Passw0rd-fixture';

const UNI = { id: 'uni-1', name: 'Mansoura University', nameAr: 'جامعة المنصورة', logoUrl: null };
const FAC = { id: 'fac-eng', universityId: 'uni-1', name: 'Faculty of Engineering', nameAr: 'كلية الهندسة' };
const DEPT_GENERAL = { id: 'dep-general', facultyId: 'fac-eng', studyType: 'GENERAL', name: 'Preparatory', nameAr: 'الإعدادية' };
const DEPT_PROGRAMS = { id: 'dep-programs', facultyId: 'fac-eng', studyType: 'PROGRAMS', name: 'CCE Program', nameAr: 'برنامج الاتصالات' };
const YEARS = [
  { id: 'yr-1', order: 1, name: 'First Year', nameAr: 'الفرقة الأولى', kind: 'YEAR' },
  { id: 'yr-2', order: 2, name: 'Second Year', nameAr: 'الفرقة الثانية', kind: 'YEAR' },
];
const TEACHER = { id: 't-ahmed', fullName: 'Dr. Ahmed Hassan', avatarUrl: null, title: 'Professor of Mechanics', bio: 'Twenty years of teaching.' };

const USERS = {
  'stu-general': { id: 'stu-general', fullName: 'Salma General', phone: '01000000101', role: 'STUDENT', status: 'ACTIVE', department: DEPT_GENERAL, year: YEARS[0] },
  'stu-programs': { id: 'stu-programs', fullName: 'Omar Programs', phone: '01000000102', role: 'STUDENT', status: 'ACTIVE', department: DEPT_PROGRAMS, year: YEARS[1] },
  'stu-disabled': { id: 'stu-disabled', fullName: 'Disabled Student', phone: '01000000103', role: 'STUDENT', status: 'DISABLED', department: DEPT_GENERAL, year: YEARS[0] },
  'teacher-1': { id: 'teacher-1', fullName: 'Staff Teacher', phone: '01000000199', role: 'TEACHER', status: 'ACTIVE', department: null, year: null },
};

const lesson = (id, sectionId, courseId, title, order, over = {}) => ({
  id, sectionId, courseId, title, kind: 'VIDEO', order, durationSeconds: 900, isPreview: false, attachmentCount: 0, ...over,
});

/** departments: [] means the whole faculty (General and Programs alike). */
const COURSES = {
  'c-mech': {
    id: 'c-mech', title: 'Mechanics 101', status: 'PUBLISHED', isFree: false, price: 300, departments: [], academicYear: YEARS[0],
    enrollmentMethods: ['CODE'], teacherId: 't-ahmed',
    shortDescription: 'Statics and dynamics for first year.', description: 'The full mechanics course.\nCovers statics, then dynamics.',
    outcomes: ['Solve equilibrium problems'], requirements: ['Secondary school physics'],
    sections: [
      { id: 's1', title: 'Statics', partId: 'p1', lessons: [lesson('l1', 's1', 'c-mech', 'Forces and moments', 1, { isPreview: true }), lesson('l2', 's1', 'c-mech', 'Equilibrium', 2)] },
      { id: 's2', title: 'Trusses', partId: 'p1', lessons: [lesson('l3', 's2', 'c-mech', 'Method of joints', 1)] },
      { id: 's3', title: 'Dynamics', partId: 'p2', lessons: [lesson('l4', 's3', 'c-mech', 'Kinematics', 1), lesson('l5', 's3', 'c-mech', 'Kinetics', 2)] },
    ],
    parts: [
      { id: 'p1', title: 'Before Midterm', titleAr: 'قبل الميدترم', price: 180 },
      { id: 'p2', title: 'After Midterm', titleAr: 'بعد الميدترم', price: 150 },
    ],
    attachments: [{ id: 'att-1', title: 'Formula sheet.pdf', kind: 'PDF' }],
  },
  'c-chem': {
    id: 'c-chem', title: 'General Chemistry', status: 'PUBLISHED', isFree: false, price: 200, departments: ['dep-general'], academicYear: YEARS[0],
    enrollmentMethods: ['CODE'], teacherId: 't-ahmed', shortDescription: 'For the preparatory year.', description: 'Chemistry for General students.',
    outcomes: [], requirements: [],
    sections: [{ id: 'cs1', title: 'Atomic structure', partId: null, lessons: [lesson('cl1', 'cs1', 'c-chem', 'The atom', 1)] }],
    parts: [], attachments: [],
  },
  'c-net': {
    id: 'c-net', title: 'Computer Networks', status: 'PUBLISHED', isFree: false, price: 250, departments: ['dep-programs'], academicYear: YEARS[1],
    enrollmentMethods: ['CODE'], teacherId: 't-ahmed', shortDescription: 'For the CCE program.', description: 'Networks for Programs students.',
    outcomes: [], requirements: [],
    sections: [{ id: 'ns1', title: 'Layers', partId: null, lessons: [lesson('nl1', 'ns1', 'c-net', 'OSI model', 1)] }],
    parts: [], attachments: [],
  },
  'c-free': {
    id: 'c-free', title: 'Study Skills', status: 'PUBLISHED', isFree: true, price: null, departments: [], academicYear: YEARS[1],
    enrollmentMethods: ['FREE'], teacherId: 't-ahmed', shortDescription: 'Free for everyone.', description: 'How to study.',
    outcomes: [], requirements: [],
    sections: [{ id: 'fs1', title: 'Planning', partId: null, lessons: [lesson('fl1', 'fs1', 'c-free', 'A weekly plan', 1)] }],
    parts: [], attachments: [],
  },
  'c-draft': {
    id: 'c-draft', title: 'Unpublished Course', status: 'DRAFT', isFree: false, price: 100, departments: [], academicYear: YEARS[0],
    enrollmentMethods: ['CODE'], teacherId: 't-ahmed', shortDescription: '', description: '', outcomes: [], requirements: [], sections: [], parts: [], attachments: [],
  },
};

const MATERIALS = {
  'm-mech': {
    id: 'm-mech', title: 'Mechanics Revision Notes', titleAr: 'ملزمة الميكانيكا', description: 'Solved sheets and summaries.', departments: [], subject: { id: 'sub-mech', name: 'Mechanics' },
    academicYear: { id: 'yr-1', name: 'First Year', nameAr: 'الفرقة الأولى', kind: 'YEAR' },
    parts: [
      { id: 'mp-free', title: 'Sample chapter', price: 0, isPreview: true, pageCount: 6 },
      { id: 'mp-1', title: 'Statics sheets', price: 50, isPreview: false, pageCount: 24 },
      { id: 'mp-2', title: 'Dynamics sheets', price: 60, isPreview: false, pageCount: 30 },
    ],
    packages: [{ id: 'mpk-all', title: 'Both sheets', price: 90, partIds: ['mp-1', 'mp-2'] }],
  },
  'm-cce': {
    id: 'm-cce', title: 'CCE Lab Manual', titleAr: null, description: 'For the CCE program only.', departments: ['dep-programs'], subject: { id: 'sub-net', name: 'Networks' },
    academicYear: { id: 'yr-2', name: 'Second Year', nameAr: 'الفرقة الثانية', kind: 'YEAR' },
    parts: [{ id: 'cp-1', title: 'Lab 1', price: 40, isPreview: false, pageCount: 12 }],
    packages: [],
  },
};

const CODES = () => ({
  'FULL-MECH-0001': { kind: 'ACCESS', targetType: 'COURSE', courseId: 'c-mech' },
  'FULL-MECH-0002': { kind: 'ACCESS', targetType: 'COURSE', courseId: 'c-mech' },
  'PART-MECH-P1A1': { kind: 'ACCESS', targetType: 'PART', courseId: 'c-mech', partId: 'p1' },
  'PART-MECH-P1B2': { kind: 'ACCESS', targetType: 'PART', courseId: 'c-mech', partId: 'p1' },
  'PART-MECH-P2A1': { kind: 'ACCESS', targetType: 'PART', courseId: 'c-mech', partId: 'p2' },
  'SECT-MECH-S3A1': { kind: 'ACCESS', targetType: 'SECTION', courseId: 'c-mech', sectionId: 's3' },
  'TEACH-AHMD-0001': { kind: 'ACCESS', targetType: 'TEACHER', courseId: null, teacherId: 't-ahmed', grantedCourseIds: ['c-mech', 'c-free'] },
  'FULL-CHEM-0001': { kind: 'ACCESS', targetType: 'COURSE', courseId: 'c-chem' },
  'FULL-NETW-0001': { kind: 'ACCESS', targetType: 'COURSE', courseId: 'c-net' },
  'EXPD-MECH-0001': { kind: 'ACCESS', targetType: 'COURSE', courseId: 'c-mech', expired: true },
  'REVK-MECH-0001': { kind: 'ACCESS', targetType: 'COURSE', courseId: 'c-mech', status: 'REVOKED' },
  'USED-MECH-0001': { kind: 'ACCESS', targetType: 'COURSE', courseId: 'c-mech', redemptionCount: 1 },
  'RCHG-0100-AAAA': { kind: 'RECHARGE', credit: 100 },
  'RCHG-0050-BBBB': { kind: 'RECHARGE', credit: 50 },
  'RCHG-USED-0001': { kind: 'RECHARGE', credit: 100, redemptionCount: 1 },
});

let state;

function reset() {
  state = {
    storefront: true,
    throttleCodes: false,
    redeemDelayMs: 0,
    sessions: new Map(), // sessionId -> { userId, deviceId, access, refresh, revoked }
    devices: [], // every device row a sign-in created
    securityEvents: [],
    loginHeaders: [], // what each sign-in request carried
    deviceHeaderRequests: [], // any request at all that carried a device header
    protectedHits: [], // lesson / playback / attachment / reader routes reached
    requests: [],
    codes: Object.fromEntries(Object.entries(CODES()).map(([code, c]) => [code, { maxRedemptions: 1, redemptionCount: 0, status: 'ACTIVE', redeemedBy: [], ...c }])),
    enrollments: {}, // `${userId}:${courseId}` -> { state, coversAll, sectionIds:Set, enrolledAt }
    partOwned: {}, // `${userId}:${partId}` -> ISO
    wallets: {}, // userId -> { balance, totalRecharged, totalSpent, tx: [] }
    libraryOwned: {}, // `${userId}:${partId}` -> { source, grantedAt }
    libraryPurchases: {}, // idempotencyKey -> result
  };
}
reset();

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message ?? code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
const fail = (status, code, message, details) => {
  throw new ApiError(status, code, message, details);
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const now = () => new Date().toISOString();
const paginate = (items, q) => {
  const page = Number(q.get('page') ?? 1);
  const pageSize = Number(q.get('pageSize') ?? 20);
  const slice = items.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  return { items: slice, meta: { page, pageSize, total: items.length, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 } };
};

function allowQuery(q, allowed) {
  for (const key of q.keys()) if (!allowed.includes(key)) fail(422, 'VALIDATION_ERROR', `property ${key} should not exist`);
}
function allowBody(body, allowed) {
  for (const key of Object.keys(body ?? {})) if (!allowed.includes(key)) fail(422, 'VALIDATION_ERROR', `property ${key} should not exist`);
}

function publicUser(u) {
  return {
    id: u.id, fullName: u.fullName, phone: u.phone, role: u.role, status: u.status, gender: 'FEMALE', avatarUrl: null,
    university: u.department ? UNI : null, faculty: u.department ? FAC : null, department: u.department,
    academicYear: u.year ? { ...u.year, structure: { kind: u.year.kind } } : null, createdAt: '2026-09-01T08:00:00.000Z',
  };
}

function authenticate(req) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) fail(401, 'UNAUTHORIZED', 'Authentication required');
  for (const [id, s] of state.sessions) {
    if (s.access === token) {
      if (s.revoked) fail(401, 'SESSION_EXPIRED', 'Session ended');
      return { user: USERS[s.userId], sessionId: id, session: s };
    }
  }
  fail(401, 'UNAUTHORIZED', 'Invalid or expired token');
}

function studentOnly(req) {
  const principal = authenticate(req);
  if (principal.user.role !== 'STUDENT') fail(403, 'INSUFFICIENT_ROLE', 'Students only');
  return principal;
}

const targeted = (course, user) => course.departments.length === 0 || (user.department && course.departments.includes(user.department.id));
const enrollmentOf = (userId, courseId) => state.enrollments[`${userId}:${courseId}`] ?? null;
const ownsPart = (userId, partId) => Boolean(state.partOwned[`${userId}:${partId}`]);

function sectionOpen(user, course, section) {
  const e = enrollmentOf(user.id, course.id);
  if (!e || e.state !== 'ACTIVE') return false;
  if (e.coversAll) return true;
  if (section.partId && ownsPart(user.id, section.partId)) return true;
  return e.sectionIds.has(section.id);
}

function accessOf(user, course) {
  const e = user ? enrollmentOf(user.id, course.id) : null;
  const stateName = e ? e.state : 'NOT_ENROLLED';
  const methods = stateName === 'NOT_ENROLLED' || stateName === 'EXPIRED' ? course.enrollmentMethods.filter((m) => m !== 'PAYMENT') : [];
  return { state: stateName, expiresAt: null, enrolledAt: e?.enrolledAt ?? null, availableMethods: methods };
}

function summary(user, course) {
  const lessonCount = course.sections.reduce((n, s) => n + s.lessons.length, 0);
  return {
    id: course.id, title: course.title, slug: course.id, shortDescription: course.shortDescription, thumbnailUrl: null,
    teacher: TEACHER, teachers: [TEACHER], status: course.status,
    price: course.isFree || course.price === null ? null : { amount: course.price, currency: 'EGP' },
    isFree: course.isFree, lessonCount, sectionCount: course.sections.length, totalDurationSeconds: lessonCount * 900,
    rating: null, studentCount: null, university: { id: UNI.id, name: UNI.name, nameAr: UNI.nameAr },
    academicYear: { id: course.academicYear.id, name: course.academicYear.name, nameAr: course.academicYear.nameAr },
    access: accessOf(user, course), progress: null, publishedAt: '2026-09-15T08:00:00.000Z',
  };
}

function detail(user, course) {
  return {
    ...summary(user, course),
    description: course.description, requirements: course.requirements, outcomes: course.outcomes, updatedAt: '2026-11-01T08:00:00.000Z',
    completionRule: { type: 'WATCH_PERCENT', threshold: 90, requireContiguous: false },
    sections: course.sections.map((s, i) => {
      const open = user ? sectionOpen(user, course, s) : false;
      return {
        id: s.id, courseId: course.id, title: s.title, description: null, order: i + 1, lessonCount: s.lessons.length,
        durationSeconds: s.lessons.length * 900, locked: !open, unlocksAt: null, progressPercent: 0,
        lessons: s.lessons.map((l) => ({ ...l, locked: !open && !l.isPreview, progress: null })),
      };
    }),
    attachments: course.attachments.map((a) => ({
      id: a.id, lessonId: null, sectionId: null, courseId: course.id, title: a.title, kind: a.kind, sizeBytes: 120000, pageCount: 4,
      protected: true, downloadable: false, locked: true,
    })),
  };
}

function partsView(user, course) {
  const e = enrollmentOf(user.id, course.id);
  const whole = e?.state === 'ACTIVE' && e.coversAll;
  const parts = course.parts.map((p, i) => {
    const direct = ownsPart(user.id, p.id);
    const owned = whole || direct;
    const sections = course.sections.filter((s) => s.partId === p.id);
    return {
      id: p.id, title: p.title, titleAr: p.titleAr, description: null, sortOrder: i + 1, thumbnailKey: null, thumbnailUrl: null,
      price: p.price, pricePercent: null, currency: 'EGP', owned, ownedSince: owned ? (state.partOwned[`${user.id}:${p.id}`] ?? e?.enrolledAt ?? null) : null,
      ownedVia: whole ? 'FULL_COURSE' : direct ? 'PART_PURCHASE' : null, purchasable: !owned, sectionCount: sections.length,
      sections: sections.map((s, j) => ({ id: s.id, title: s.title, titleAr: null, sortOrder: j + 1, locked: !sectionOpen(user, course, s) })),
    };
  });
  return {
    courseId: course.id, hasParts: course.parts.length > 0, coursePrice: course.isFree ? 0 : course.price,
    ownsAllParts: course.parts.length > 0 && parts.every((p) => p.owned), parts,
  };
}

function wallet(userId) {
  state.wallets[userId] ??= { balance: 0, totalRecharged: 0, totalSpent: 0, tx: [] };
  return state.wallets[userId];
}

function ledger(userId, type, direction, source, amount, note) {
  const w = wallet(userId);
  const before = w.balance;
  w.balance = direction === 'CREDIT' ? before + amount : before - amount;
  if (direction === 'CREDIT') w.totalRecharged += amount;
  else w.totalSpent += amount;
  const tx = { id: `tx-${w.tx.length + 1}-${userId}`, type, direction, source, amount, currency: 'EGP', balanceBefore: before, balanceAfter: w.balance, referenceType: null, referenceId: null, note, createdAt: now() };
  w.tx.unshift(tx);
  return tx;
}

/** 10 attempts per 5 minutes, per user, per route — the backend's @CodeThrottle. */
const throttle = new Map();
function codeThrottle(userId, route) {
  if (!state.throttleCodes) return;
  const key = `${userId}:${route}`;
  const hits = (throttle.get(key) ?? 0) + 1;
  throttle.set(key, hits);
  if (hits > 2) fail(429, 'RATE_LIMITED', 'Too many requests');
}

function normalizeCode(raw) {
  if (typeof raw !== 'string') fail(422, 'VALIDATION_ERROR', 'code must be a string');
  const code = raw.trim().toUpperCase();
  if (code.length < 4 || code.length > 40) fail(422, 'VALIDATION_ERROR', 'code length');
  return code;
}

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

const libOwned = (userId, partId) => Boolean(state.libraryOwned[`${userId}:${partId}`]);
const materialInScope = (m, user) => m.departments.length === 0 || m.departments.includes(user.department?.id);

function materialSummary(user, m) {
  const paid = m.parts.filter((p) => !p.isPreview);
  return {
    id: m.id, title: m.title, titleAr: m.titleAr, description: m.description, coverUrl: null, subject: m.subject, academicYear: m.academicYear,
    academicYears: [m.academicYear], partCount: m.parts.length, packageCount: m.packages.length,
    ownedPartCount: m.parts.filter((p) => libOwned(user.id, p.id)).length,
    priceFrom: paid.length ? Math.min(...paid.map((p) => p.price)) : null, priceTotal: paid.reduce((n, p) => n + p.price, 0),
  };
}

function materialDetail(user, m) {
  const header = { id: m.id, title: m.title, titleAr: m.titleAr, description: m.description, coverUrl: null, subject: m.subject, academicYear: m.academicYear, academicYears: [m.academicYear] };
  const ownsAny = m.parts.some((p) => libOwned(user.id, p.id));
  const full = state.storefront && materialInScope(m, user);
  if (!full) {
    if (!ownsAny) fail(404, 'NOT_FOUND', 'Material not found');
    return {
      ...header, view: 'OWNER', packages: [],
      parts: m.parts.filter((p) => libOwned(user.id, p.id)).map((p, i) => ({
        id: p.id, title: p.title, titleAr: null, description: null, sortOrder: i + 1, pageCount: p.pageCount, mimeType: 'application/pdf',
        access: 'OWNED', ownership: 'OWNED', ownedSince: state.libraryOwned[`${user.id}:${p.id}`].grantedAt, owned: true,
      })),
    };
  }
  const parts = m.parts.map((p, i) => {
    const owned = libOwned(user.id, p.id);
    const access = owned ? 'OWNED' : p.isPreview ? 'PREVIEW' : 'PURCHASABLE';
    return {
      id: p.id, title: p.title, titleAr: null, description: null, sortOrder: i + 1, price: p.price, currency: 'EGP', pageCount: p.pageCount,
      mimeType: 'application/pdf', thumbnailUrl: null, access, ownership: owned ? 'OWNED' : 'NONE',
      ownedSince: owned ? state.libraryOwned[`${user.id}:${p.id}`].grantedAt : null, isPreview: p.isPreview, owned: owned || p.isPreview, purchasable: access === 'PURCHASABLE',
    };
  });
  return {
    ...header, view: 'FULL', ownsAllParts: m.parts.filter((p) => !p.isPreview).every((p) => libOwned(user.id, p.id)), parts,
    packages: m.packages.map((k) => {
      const already = k.partIds.filter((id) => libOwned(user.id, id)).length;
      return {
        id: k.id, title: k.title, titleAr: null, description: null, price: k.price, currency: 'EGP', partCount: k.partIds.length, partIds: k.partIds,
        partsAlreadyOwned: already, access: already === k.partIds.length ? 'OWNED' : 'PURCHASABLE', fullyOwned: already === k.partIds.length,
      };
    }),
  };
}

function libraryTarget(user, body) {
  allowBody(body, ['kind', 'targetId']);
  if (!state.storefront) fail(404, 'NOT_FOUND', 'Not found');
  for (const m of Object.values(MATERIALS)) {
    if (body.kind === 'PART') {
      const part = m.parts.find((p) => p.id === body.targetId);
      if (part) return { m, title: part.title, price: part.price, partIds: [part.id], preview: part.isPreview };
    } else if (body.kind === 'PACKAGE') {
      const pk = m.packages.find((p) => p.id === body.targetId);
      if (pk) return { m, title: pk.title, price: pk.price, partIds: pk.partIds, preview: false };
    }
  }
  fail(404, 'NOT_FOUND', 'Not found');
}

function assertMayAcquire(user, target) {
  if (!materialInScope(target.m, user)) fail(404, 'NOT_FOUND', 'Not found');
  if (target.preview || target.price <= 0) fail(409, 'INVALID_STATE', 'This item is not for sale');
  if (target.partIds.every((id) => libOwned(user.id, id))) fail(409, 'CONFLICT', 'You already own this');
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

async function route(req, url, body) {
  const method = req.method;
  const path = url.pathname.slice(PREFIX.length).replace(/\/+$/, '') || '/';
  const q = url.searchParams;
  let m;

  // --- auth ---------------------------------------------------------------
  if (method === 'POST' && path === '/auth/login') {
    allowBody(body, ['phone', 'password']);
    state.loginHeaders.push({
      'x-device-id': req.headers['x-device-id'] ?? null,
      'x-device-platform': req.headers['x-device-platform'] ?? null,
      'x-client': req.headers['x-client'] ?? null,
    });
    const user = Object.values(USERS).find((u) => u.phone === body?.phone);
    if (!user || body?.password !== PASSWORD) fail(401, 'INVALID_CREDENTIALS', 'Invalid phone or password');
    if (user.status === 'DISABLED') fail(403, 'ACCOUNT_DISABLED', 'Account is disabled');

    // DevicesService.resolveOnLogin: no header -> nothing is written at all.
    let deviceId = null;
    let device = { authorized: false, status: null, reason: 'no-device-header' };
    const key = req.headers['x-device-id'];
    if (user.role === 'STUDENT' && key) {
      const active = state.devices.filter((d) => d.userId === user.id && d.status === 'ACTIVE');
      const existing = state.devices.find((d) => d.userId === user.id && d.deviceKey === key);
      if (existing) {
        deviceId = existing.id;
        device = { authorized: existing.status === 'ACTIVE', status: existing.status };
      } else {
        const status = active.length === 0 ? 'ACTIVE' : 'PENDING_APPROVAL';
        const row = { id: `dev-${state.devices.length + 1}`, userId: user.id, deviceKey: key, platform: req.headers['x-device-platform'] ?? 'unknown', status };
        state.devices.push(row);
        deviceId = row.id;
        if (status !== 'ACTIVE') state.securityEvents.push({ type: 'DEVICE_MISMATCH', userId: user.id });
        device = { authorized: status === 'ACTIVE', status, reason: status === 'ACTIVE' ? undefined : 'limit-reached' };
      }
    }

    const sessionId = randomUUID();
    const session = { userId: user.id, deviceId, access: `at.${randomUUID()}`, refresh: `rt.${randomUUID()}`, revoked: false };
    state.sessions.set(sessionId, session);
    return { user: publicUser(user), accessToken: session.access, refreshToken: session.refresh, expiresIn: 900, device };
  }

  if (method === 'POST' && path === '/auth/refresh') {
    allowBody(body, ['refreshToken']);
    for (const s of state.sessions.values()) {
      if (s.refresh === body?.refreshToken && !s.revoked) {
        s.access = `at.${randomUUID()}`;
        s.refresh = `rt.${randomUUID()}`;
        return { user: publicUser(USERS[s.userId]), accessToken: s.access, refreshToken: s.refresh, expiresIn: 900, device: { authorized: false } };
      }
    }
    fail(401, 'SESSION_EXPIRED', 'Session expired');
  }

  if (method === 'POST' && path === '/auth/logout') {
    const { session } = authenticate(req);
    session.revoked = true;
    return { ok: true };
  }

  if (method === 'POST' && path === '/auth/logout-all') {
    const { user } = authenticate(req);
    let n = 0;
    for (const s of state.sessions.values()) if (s.userId === user.id && !s.revoked) { s.revoked = true; n += 1; }
    return { ok: true, sessions: n };
  }

  if (method === 'GET' && (path === '/auth/me' || path === '/profile')) return publicUser(authenticate(req).user);

  // --- catalog ------------------------------------------------------------
  if (method === 'GET' && path === '/catalog/academic-years') {
    allowQuery(q, ['universityId', 'facultyId', 'departmentId']);
    return YEARS;
  }

  // --- courses ------------------------------------------------------------
  if (method === 'GET' && path === '/courses') {
    allowQuery(q, ['page', 'pageSize', 'q', 'universityId', 'facultyId', 'academicYearId', 'teacherId', 'free', 'sort']);
    const { user } = authenticate(req);
    let list = Object.values(COURSES).filter((c) => c.status === 'PUBLISHED' && targeted(c, user));
    const term = q.get('q')?.toLowerCase();
    if (term) list = list.filter((c) => c.title.toLowerCase().includes(term));
    if (q.get('academicYearId')) list = list.filter((c) => c.academicYear.id === q.get('academicYearId'));
    if (q.get('free') === 'true') list = list.filter((c) => c.isFree);
    if (q.get('sort') === 'priceLow') list = [...list].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    if (q.get('sort') === 'priceHigh') list = [...list].sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    return paginate(list.map((c) => summary(user, c)), q);
  }

  if (method === 'GET' && path === '/courses/mine') {
    allowQuery(q, ['page', 'pageSize']);
    const { user } = authenticate(req);
    const mine = Object.values(COURSES).filter((c) => enrollmentOf(user.id, c.id));
    return paginate(mine.map((c) => summary(user, c)), q);
  }

  if (method === 'GET' && (m = path.match(/^\/courses\/([\w-]+)$/))) {
    const { user } = authenticate(req);
    const course = COURSES[m[1]];
    if (!course) fail(404, 'NOT_FOUND', 'Course not found');
    if (course.status !== 'PUBLISHED') fail(404, 'COURSE_NOT_AVAILABLE', 'Course is not available');
    return detail(user, course);
  }

  if (method === 'GET' && (m = path.match(/^\/courses\/([\w-]+)\/parts$/))) {
    const { user } = studentOnly(req);
    const course = COURSES[m[1]];
    if (!course || course.status !== 'PUBLISHED') fail(404, 'NOT_FOUND', 'Course not found');
    return partsView(user, course);
  }

  if (method === 'GET' && (m = path.match(/^\/courses\/([\w-]+)\/join-options$/))) {
    const { user } = studentOnly(req);
    const course = COURSES[m[1]];
    if (!course || course.status !== 'PUBLISHED') fail(404, 'NOT_FOUND', 'Course not found');
    const view = partsView(user, course);
    const e = enrollmentOf(user.id, course.id);
    const whole = e?.state === 'ACTIVE' && e.coversAll;
    return {
      courseId: course.id, title: course.title, titleAr: null,
      fullCourse: { price: course.isFree ? 0 : course.price, currency: 'EGP', isFree: course.isFree, owned: Boolean(whole), purchasable: !whole },
      hasParts: view.hasParts, ownsAllParts: view.ownsAllParts, parts: view.parts,
      methods: { accessCode: true, wallet: false, onlinePayment: false },
      enrollmentMethods: accessOf(user, course).availableMethods,
    };
  }

  if (method === 'POST' && path === '/codes/validate') {
    const { user } = studentOnly(req);
    codeThrottle(user.id, 'validate');
    allowBody(body, ['code', 'courseId']);
    const code = state.codes[normalizeCode(body?.code)];
    if (!code) fail(400, 'INVALID_CODE', 'Invalid code');
    if (code.kind === 'RECHARGE') fail(400, 'CODE_NOT_RECHARGEABLE', 'This is a recharge card');
    if (code.status === 'REVOKED' || code.expired) fail(400, 'INVALID_CODE', 'Invalid code');
    if (code.redemptionCount >= code.maxRedemptions) fail(409, 'CODE_ALREADY_USED', 'Code already used');
    if (body.courseId && code.courseId && code.courseId !== body.courseId) fail(400, 'INVALID_CODE', 'Invalid code');
    if (code.redeemedBy.includes(user.id)) fail(409, 'CODE_ALREADY_USED', 'Code already used');
    const course = code.courseId ? COURSES[code.courseId] : null;
    const section = code.sectionId ? course.sections.find((s) => s.id === code.sectionId) : null;
    return {
      valid: true, course: course ? { id: course.id, title: course.title } : null, targetType: code.targetType,
      section: section ? { id: section.id, title: section.title } : null,
      teacher: code.teacherId ? { id: TEACHER.id, fullName: TEACHER.fullName } : null,
      remainingRedemptions: code.maxRedemptions - code.redemptionCount, accessDurationType: null, accessDurationDays: null, expiresAt: null,
    };
  }

  if (method === 'POST' && (m = path.match(/^\/courses\/([\w-]+)\/redeem$/))) {
    const { user } = studentOnly(req);
    codeThrottle(user.id, 'redeem');
    allowBody(body, ['code']);
    const raw = normalizeCode(body?.code);
    if (!/^[A-Z0-9-]+$/.test(raw)) fail(422, 'VALIDATION_ERROR', 'code format');
    const course = COURSES[m[1]];
    if (!course) fail(404, 'NOT_FOUND', 'Course not found');
    if (course.status !== 'PUBLISHED') fail(404, 'COURSE_NOT_AVAILABLE', 'Course is not available');
    if (!targeted(course, user)) fail(403, 'COURSE_NOT_TARGETED', 'This course is not offered to your department');
    if (!course.enrollmentMethods.includes('CODE')) fail(403, 'FORBIDDEN', 'This course does not accept access codes');
    const existing = enrollmentOf(user.id, course.id);
    if (existing?.state === 'ACTIVE' && existing.coversAll) fail(409, 'ALREADY_ENROLLED', 'Already enrolled');

    const code = state.codes[raw];
    if (!code) fail(400, 'INVALID_CODE', 'Invalid code');
    if (code.kind === 'RECHARGE') fail(400, 'CODE_NOT_RECHARGEABLE', 'This is a recharge card');
    if (code.status === 'REVOKED' || code.expired) fail(400, 'INVALID_CODE', 'Invalid code');
    if (code.targetType === 'TEACHER' ? !code.grantedCourseIds.includes(course.id) : code.courseId && code.courseId !== course.id) {
      fail(400, 'INVALID_CODE', 'Invalid code');
    }
    if (code.redemptionCount >= code.maxRedemptions || code.redeemedBy.includes(user.id)) fail(409, 'CODE_ALREADY_USED', 'Code already used');

    // The real backend asks, inside the redemption transaction and before the
    // card is consumed, whether it would change anything for this student. A
    // part already owned, or a section already open, is refused and the card
    // is left exactly as it was. (Lifetime access only here, so the backend's
    // renewal exception never applies.)
    if (existing?.state === 'ACTIVE') {
      const section = course.sections.find((s) => s.id === code.sectionId);
      const nothingNew =
        (code.targetType === 'PART' && ownsPart(user.id, code.partId)) ||
        (code.targetType === 'SECTION' && section !== undefined && sectionOpen(user, course, section));
      if (nothingNew) fail(409, 'ALREADY_ENROLLED', 'You already have access to everything this code unlocks. The code was not used.');
    }

    // One transaction on the real backend: the card is spent and the
    // entitlement written together. Spent synchronously here, before any
    // await, so two requests racing for one card cannot both win.
    code.redemptionCount += 1;
    code.redeemedBy.push(user.id);
    if (code.redemptionCount >= code.maxRedemptions) code.status = 'EXHAUSTED';

    const grant = (courseId, patch) => {
      const key = `${user.id}:${courseId}`;
      const e = state.enrollments[key] ?? { state: 'ACTIVE', coversAll: false, sectionIds: new Set(), enrolledAt: now() };
      e.state = 'ACTIVE';
      if (patch.coversAll) e.coversAll = true;
      for (const id of patch.sectionIds ?? []) e.sectionIds.add(id);
      state.enrollments[key] = e;
    };

    if (code.targetType === 'COURSE') grant(course.id, { coversAll: true });
    else if (code.targetType === 'TEACHER') for (const id of code.grantedCourseIds) grant(id, { coversAll: true });
    else if (code.targetType === 'SECTION') grant(course.id, { sectionIds: [code.sectionId] });
    else if (code.targetType === 'PART') {
      grant(course.id, {});
      state.partOwned[`${user.id}:${code.partId}`] ??= now();
    }

    if (state.redeemDelayMs > 0) await new Promise((r) => setTimeout(r, state.redeemDelayMs));
    return { state: 'ACTIVE', courseId: course.id, payment: null, message: null };
  }

  if (method === 'POST' && (m = path.match(/^\/courses\/([\w-]+)\/enroll$/))) {
    const { user } = studentOnly(req);
    allowBody(body, ['method']);
    const course = COURSES[m[1]];
    if (!course || course.status !== 'PUBLISHED') fail(404, 'COURSE_NOT_AVAILABLE', 'Course is not available');
    if (body?.method === 'CODE') fail(422, 'VALIDATION_ERROR', 'Use POST /courses/{id}/redeem');
    if (body?.method === 'PAYMENT') fail(402, 'PAYMENT_REQUIRED', 'Online payment is not available');
    if (!targeted(course, user)) fail(403, 'COURSE_NOT_TARGETED', 'Not offered to your department');
    if (enrollmentOf(user.id, course.id)?.state === 'ACTIVE') fail(409, 'ALREADY_ENROLLED', 'Already enrolled');
    if (!course.enrollmentMethods.includes(body?.method)) fail(403, 'FORBIDDEN', 'Method not offered');
    state.enrollments[`${user.id}:${course.id}`] = { state: 'ACTIVE', coversAll: true, sectionIds: new Set(), enrolledAt: now() };
    return { state: 'ACTIVE', courseId: course.id, payment: null, message: null };
  }

  // --- library ------------------------------------------------------------
  if (method === 'GET' && path === '/library/materials') {
    allowQuery(q, ['page', 'pageSize', 'q', 'academicYearId', 'subjectId']);
    const { user } = studentOnly(req);
    let list = state.storefront ? Object.values(MATERIALS).filter((x) => materialInScope(x, user)) : [];
    const term = q.get('q')?.toLowerCase();
    if (term) list = list.filter((x) => x.title.toLowerCase().includes(term));
    if (q.get('academicYearId')) list = list.filter((x) => x.academicYear.id === q.get('academicYearId'));
    return paginate(list.map((x) => materialSummary(user, x)), q);
  }

  if (method === 'GET' && (m = path.match(/^\/library\/materials\/([\w-]+)$/))) {
    const { user } = studentOnly(req);
    const material = MATERIALS[m[1]];
    if (!material) fail(404, 'NOT_FOUND', 'Material not found');
    return materialDetail(user, material);
  }

  if (method === 'GET' && path === '/library/me') {
    allowQuery(q, ['page', 'pageSize']);
    const { user } = studentOnly(req);
    const items = [];
    for (const material of Object.values(MATERIALS)) {
      for (const p of material.parts) {
        const own = state.libraryOwned[`${user.id}:${p.id}`];
        if (own) {
          items.push({
            entitlementId: `ent-${p.id}`, partId: p.id, title: p.title, titleAr: null, materialId: material.id, materialTitle: material.title,
            pageCount: p.pageCount, mimeType: 'application/pdf', source: own.source, grantedAt: own.grantedAt, status: 'READABLE', available: true,
          });
        }
      }
    }
    return paginate(items, q);
  }

  if (method === 'POST' && path === '/library/quote') {
    const { user } = studentOnly(req);
    const target = libraryTarget(user, body);
    if (!materialInScope(target.m, user)) fail(404, 'NOT_FOUND', 'Not found');
    const balance = wallet(user.id).balance;
    const already = target.partIds.filter((id) => libOwned(user.id, id)).length;
    return {
      kind: body.kind, targetId: body.targetId, title: target.title, materialTitle: target.m.title, price: target.price, currency: 'EGP', balance,
      sufficientCredit: balance >= target.price, shortfall: Math.max(0, target.price - balance), partCount: target.partIds.length,
      partsAlreadyOwned: already, fullyOwned: already === target.partIds.length, purchasable: !target.preview && target.price > 0 && already < target.partIds.length,
    };
  }

  if (method === 'POST' && path === '/library/purchase') {
    const { user } = studentOnly(req);
    const target = libraryTarget(user, body);
    const key = `${body.kind}:${body.targetId}:${user.id}`;
    // Idempotent replay: the original purchase, nothing charged again.
    if (state.libraryPurchases[key]) return { ...state.libraryPurchases[key], alreadyPurchased: true, balanceAfter: wallet(user.id).balance };
    assertMayAcquire(user, target);
    const w = wallet(user.id);
    // The debit is a single conditional statement on the real backend.
    if (w.balance < target.price) fail(402, 'INSUFFICIENT_CREDIT', 'Not enough credit', { required: target.price });
    const already = target.partIds.filter((id) => libOwned(user.id, id)).length;
    ledger(user.id, 'PURCHASE', 'DEBIT', body.kind === 'PART' ? 'LIBRARY_PART' : 'LIBRARY_PACKAGE', target.price, target.title);
    let granted = 0;
    for (const id of target.partIds) {
      if (!libOwned(user.id, id)) { state.libraryOwned[`${user.id}:${id}`] = { source: body.kind === 'PART' ? 'PURCHASE' : 'PACKAGE', grantedAt: now() }; granted += 1; }
    }
    const result = {
      purchaseId: `pur-${Object.keys(state.libraryPurchases).length + 1}`, kind: body.kind, targetId: body.targetId, title: target.title,
      pricePaid: target.price, currency: 'EGP', balanceAfter: w.balance, partsGranted: granted, partsAlreadyOwned: already, purchasedAt: now(), alreadyPurchased: false,
    };
    state.libraryPurchases[key] = result;
    return result;
  }

  // --- wallet -------------------------------------------------------------
  if (method === 'GET' && path === '/wallet') {
    const { user } = studentOnly(req);
    const w = wallet(user.id);
    return { balance: w.balance, currency: 'EGP', totalRecharged: w.totalRecharged, totalSpent: w.totalSpent, transactionCount: w.tx.length, updatedAt: now() };
  }

  if (method === 'GET' && path === '/wallet/transactions') {
    allowQuery(q, ['page', 'pageSize', 'q', 'order', 'type', 'direction', 'source', 'from', 'to']);
    const { user } = studentOnly(req);
    return paginate(wallet(user.id).tx, q);
  }

  if (method === 'POST' && path === '/wallet/redeem') {
    const { user } = studentOnly(req);
    codeThrottle(user.id, 'wallet-redeem');
    allowBody(body, ['code']);
    const raw = normalizeCode(body?.code);
    const code = state.codes[raw];
    if (!code || code.status === 'REVOKED' || code.expired) fail(400, 'INVALID_CODE', 'Invalid code');
    if (code.kind !== 'RECHARGE') fail(400, 'CODE_NOT_RECHARGEABLE', 'This card cannot be used to recharge');
    if (code.redemptionCount >= code.maxRedemptions || code.redeemedBy.includes(user.id)) fail(409, 'CODE_ALREADY_USED', 'Code already used');
    code.redemptionCount += 1;
    code.redeemedBy.push(user.id);
    code.status = 'EXHAUSTED';
    const tx = ledger(user.id, 'CREDIT_RECHARGE', 'CREDIT', 'PAYMENT_CODE', code.credit, 'Recharge card');
    return { codeId: `code-${raw}`, code: raw, credited: code.credit, balance: wallet(user.id).balance, currency: 'EGP', transactionId: tx.id };
  }

  // --- protected content: must never be reached by the portal --------------
  const protectedRoutes = [
    /^\/lessons\/[\w-]+$/, /^\/lessons\/by-video\/[\w-]+$/, /^\/playback\/videos\/[\w-]+\/ticket$/, /^\/playback\/.+$/,
    /^\/attachments\/[\w-]+\/ticket$/, /^\/library\/parts\/[\w-]+\/open$/, /^\/devices(\/.*)?$/,
  ];
  if (protectedRoutes.some((rx) => rx.test(path))) {
    state.protectedHits.push({ method, path });
    authenticate(req);
    // A working answer, so a leak would be visible as content rather than as an error.
    return { url: 'https://media.invalid/signed?sig=LEAK', manifestUrl: 'https://media.invalid/master.m3u8?sig=LEAK', video: { id: 'vid-LEAK' } };
  }

  fail(404, 'NOT_FOUND', `No route ${method} ${path}`);
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

function serializeState() {
  return {
    storefront: state.storefront,
    loginHeaders: state.loginHeaders,
    deviceHeaderRequests: state.deviceHeaderRequests,
    devices: state.devices,
    securityEvents: state.securityEvents,
    protectedHits: state.protectedHits,
    requests: state.requests,
    sessions: [...state.sessions.values()].map((s) => ({ userId: s.userId, deviceId: s.deviceId, revoked: s.revoked })),
    codes: Object.fromEntries(Object.entries(state.codes).map(([k, c]) => [k, { status: c.status, redemptionCount: c.redemptionCount, redeemedBy: c.redeemedBy }])),
    wallets: Object.fromEntries(Object.entries(state.wallets).map(([k, w]) => [k, { balance: w.balance, totalRecharged: w.totalRecharged, totalSpent: w.totalSpent, transactions: w.tx.length }])),
    enrollments: Object.fromEntries(Object.entries(state.enrollments).map(([k, e]) => [k, { state: e.state, coversAll: e.coversAll, sectionIds: [...e.sectionIds] }])),
    partOwned: Object.keys(state.partOwned),
    libraryOwned: Object.keys(state.libraryOwned),
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const send = (status, payload) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
  };

  let raw = '';
  for await (const chunk of req) raw += chunk;
  let body;
  try {
    body = raw ? JSON.parse(raw) : undefined;
  } catch {
    return send(400, { success: false, error: { code: 'VALIDATION_ERROR', message: 'Bad JSON' }, code: 'VALIDATION_ERROR', message: 'Bad JSON', statusCode: 400 });
  }

  if (url.pathname.startsWith('/__test/')) {
    if (url.pathname === '/__test/reset') { reset(); throttle.clear(); return send(200, { ok: true }); }
    if (url.pathname === '/__test/state') return send(200, serializeState());
    if (url.pathname === '/__test/set') { Object.assign(state, body ?? {}); return send(200, { ok: true }); }
    if (url.pathname === '/__test/expire-access') {
      // The access token stops working; the refresh token still does.
      for (const s of state.sessions.values()) if (!body?.userId || s.userId === body.userId) s.access = `expired.${randomUUID()}`;
      return send(200, { ok: true });
    }
    if (url.pathname === '/__test/grant') {
      // Seed ownership directly, for tests that start from an existing state.
      const { userId, courseId, coversAll, partIds = [], sectionIds = [], libraryPartIds = [], balance } = body ?? {};
      if (courseId) state.enrollments[`${userId}:${courseId}`] = { state: 'ACTIVE', coversAll: Boolean(coversAll), sectionIds: new Set(sectionIds), enrolledAt: now() };
      for (const id of partIds) state.partOwned[`${userId}:${id}`] = now();
      for (const id of libraryPartIds) state.libraryOwned[`${userId}:${id}`] = { source: 'PURCHASE', grantedAt: now() };
      if (typeof balance === 'number') ledger(userId, 'ADMIN_ADJUSTMENT', 'CREDIT', 'ADMIN', balance, 'Fixture credit');
      return send(200, { ok: true });
    }
    return send(404, { ok: false });
  }

  if (!url.pathname.startsWith(PREFIX)) return send(404, { success: false, code: 'NOT_FOUND', message: 'Not found', statusCode: 404 });

  const deviceHeaders = Object.keys(req.headers).filter((h) => h.startsWith('x-device-'));
  state.requests.push({ method: req.method, path: url.pathname.slice(PREFIX.length), query: url.search });
  if (deviceHeaders.length > 0) state.deviceHeaderRequests.push({ method: req.method, path: url.pathname.slice(PREFIX.length), headers: deviceHeaders });

  try {
    const data = await route(req, url, body);
    send(req.method === 'POST' && !/validate|quote|refresh|logout/.test(url.pathname) ? 201 : 200, { success: true, data, meta: { requestId: randomUUID() } });
  } catch (e) {
    if (e instanceof ApiError) {
      return send(e.status, {
        success: false, error: { code: e.code, message: e.message, details: e.details }, statusCode: e.status, code: e.code, message: e.message,
        requestId: randomUUID(), timestamp: now(), path: url.pathname,
      });
    }
    console.error(e);
    send(500, { success: false, error: { code: 'SERVER_ERROR', message: 'Internal error' }, statusCode: 500, code: 'SERVER_ERROR', message: 'Internal error' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`activation mock backend on http://127.0.0.1:${PORT}${PREFIX}`);
});
