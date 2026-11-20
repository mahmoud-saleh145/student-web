/* eslint-disable @typescript-eslint/no-require-imports */
// Fixtures for running the activation portal against the REAL backend code.
//
//   BACKEND_DIR=<checkout of student-backend, built, with node_modules>
//   DATABASE_URL=postgresql://…@127.0.0.1:<port>/<name>_test
//   REDIS_URL=redis://127.0.0.1:<port>/<db>
//   BACKEND_URL=http://127.0.0.1:<port>/api/v1
//   node e2e/activation-real/seed.cjs
//
// Everything this script touches is disposable, and it checks that before it
// touches anything: the database must be on this machine and its name must end
// in `_test`, the Redis must be on this machine, and so must the backend. It
// EMPTIES that database. It cannot be pointed at a hosted database by mistake.
//
// Two halves, on purpose:
//
//   1. Structure, accounts, courses and library documents are written with the
//      backend's own Prisma client (loaded from BACKEND_DIR, so the schema is
//      the backend's, not a copy).
//   2. Cards are NOT inserted. They are generated through the backend's real
//      admin API, so every card carries the scope snapshot the real generator
//      freezes onto it — which is the thing redemption reads.
//
// The accounts are fixtures for a throwaway database. They are not, and do not
// resemble, real accounts.

const { createRequire } = require('node:module');
const fs = require('node:fs');
const path = require('node:path');

const BACKEND_DIR = process.env.BACKEND_DIR;
const DATABASE_URL = process.env.DATABASE_URL ?? '';
const REDIS_URL = process.env.REDIS_URL ?? '';
const BACKEND_URL = (process.env.BACKEND_URL ?? '').replace(/\/$/, '');
const OUT = process.env.ACTIVATION_REAL_FIXTURES ?? path.join(__dirname, '.fixtures.json');

const LOCAL = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

function mustBeLocal(name, value) {
  let host;
  try {
    host = new URL(value).hostname;
  } catch {
    throw new Error(`${name} is not set or is not a URL.`);
  }
  if (!LOCAL.has(host)) throw new Error(`Refusing to run: ${name} points at "${host}", not this machine.`);
}

if (!BACKEND_DIR) throw new Error('BACKEND_DIR is not set.');
mustBeLocal('DATABASE_URL', DATABASE_URL);
mustBeLocal('REDIS_URL', REDIS_URL);
mustBeLocal('BACKEND_URL', BACKEND_URL);
const databaseName = new URL(DATABASE_URL).pathname.replace(/^\//, '');
if (!databaseName.endsWith('_test')) {
  throw new Error(`Refusing to run: database "${databaseName}" does not end in "_test". This script empties it.`);
}

// A local address does not prove a throwaway instance. Port 6379 is where a
// developer's ordinary Redis lives, and this script FLUSHES the database it is
// given; a `.env` beside the backend means that backend process may not be
// running on the throwaway database at all (the shared one is
// production-shaped). Both are refused rather than trusted.
if (new URL(REDIS_URL).port === '' || new URL(REDIS_URL).port === '6379') {
  throw new Error('Refusing to run: REDIS_URL uses the default Redis port. Use the dedicated throwaway instance (see backend-env.sh).');
}
if (fs.existsSync(path.join(path.resolve(BACKEND_DIR), '.env')) || fs.existsSync(path.join(path.resolve(BACKEND_DIR), '.env.local'))) {
  throw new Error(`Refusing to run: ${BACKEND_DIR} contains a .env file, so its backend may not be using the throwaway database. Use a checkout without one.`);
}

const backendRequire = createRequire(path.join(path.resolve(BACKEND_DIR), 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
const argon2 = backendRequire('argon2');
const Redis = backendRequire('ioredis');

/** Fixture password for the throwaway accounts below. */
const PASSWORD = 'Fixture-Passw0rd-activation';

const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

async function emptyEverything() {
  const tables = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'`;
  if (tables.length > 0) {
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 2 });
  await redis.flushdb();
  await redis.quit();
}

async function user(passwordHash, data) {
  return prisma.user.create({
    data: { status: 'ACTIVE', locale: 'en', passwordHash, ...data },
  });
}

async function course(data, sections) {
  const { teacherId, price, ...rest } = data;
  const created = await prisma.course.create({
    data: {
      slug: `it-${rest.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`,
      shortDescription: 'Activation portal integration fixture',
      status: 'PUBLISHED',
      isFree: false,
      enrollmentMethods: ['CODE'],
      accessDurationType: 'LIFETIME',
      publishedAt: new Date(),
      ...rest,
      teachers: { create: { teacherId, isLead: true, canEditContent: true, canEditPricing: true, canPublish: true } },
      ...(price != null ? { prices: { create: { amount: price, currency: 'EGP', version: 1, isCurrent: true } } } : {}),
    },
  });

  const out = [];
  let lessonCount = 0;
  for (const [index, title] of sections.entries()) {
    const section = await prisma.courseSection.create({
      data: { courseId: created.id, title, sortOrder: index + 1, status: 'PUBLISHED' },
    });
    const lesson = await prisma.lesson.create({
      data: {
        courseId: created.id,
        sectionId: section.id,
        title: `${title} — lecture 1`,
        kind: 'VIDEO',
        sortOrder: 1,
        status: 'PUBLISHED',
        durationSeconds: 600,
      },
    });
    await prisma.video.create({
      data: {
        lessonId: lesson.id,
        courseId: created.id,
        status: 'READY',
        hlsPrefix: `hls/${lesson.id}/`,
        masterPlaylistKey: `hls/${lesson.id}/master.m3u8`,
        durationSeconds: 600,
        isEncrypted: true,
        encryptionKeyId: 'k1',
        lessonLinks: { create: { lessonId: lesson.id } },
      },
    });
    lessonCount += 1;
    out.push({ id: section.id, title, lessonId: lesson.id });
  }
  await prisma.course.update({ where: { id: created.id }, data: { lessonCount, sectionCount: sections.length } });
  return { id: created.id, title: created.title, sections: out };
}

async function api(method, route, { token, body, headers } = {}) {
  const res = await fetch(`${BACKEND_URL}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${route} → ${res.status} ${JSON.stringify(json).slice(0, 400)}`);
  return json.data ?? json;
}

async function main() {
  await emptyEverything();

  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 8192, timeCost: 2, parallelism: 1 });

  // --- Academic structure ----------------------------------------------------
  const uni = await prisma.university.create({ data: { name: 'Fixture University', nameAr: 'جامعة تجريبية' } });
  const general = await prisma.faculty.create({ data: { universityId: uni.id, name: 'Engineering (General)', nameAr: 'هندسة عام' } });
  const programs = await prisma.faculty.create({ data: { universityId: uni.id, name: 'Engineering (Programs)', nameAr: 'هندسة برامج' } });
  const prep = await prisma.department.create({ data: { facultyId: general.id, name: 'Preparatory year', nameAr: 'اعدادي', studyType: 'GENERAL' } });
  const cce = await prisma.department.create({ data: { facultyId: programs.id, name: 'CCE', nameAr: 'اتصالات', studyType: 'PROGRAMS' } });
  const ladder = await prisma.academicStructure.create({ data: { kind: 'YEAR', scopeKey: `faculty:${general.id}`, facultyId: general.id } });
  const year1 = await prisma.academicYear.create({ data: { structureId: ladder.id, order: 1, name: 'Preparatory year', nameAr: 'الاعدادية' } });

  // --- Accounts --------------------------------------------------------------
  const admin = await user(passwordHash, { phone: '01055500001', fullName: 'Fixture Administrator', role: 'ADMIN' });
  const teacherOne = await user(passwordHash, { phone: '01055500002', fullName: 'Fixture Teacher One', role: 'TEACHER' });
  const teacherTwo = await user(passwordHash, { phone: '01055500003', fullName: 'Fixture Teacher Two', role: 'TEACHER' });

  const studentOf = async (phone, fullName, facultyId, departmentId, extra = {}) => {
    const created = await user(passwordHash, { phone, fullName, role: 'STUDENT', ...extra });
    await prisma.studentProfile.create({
      data: { userId: created.id, universityId: uni.id, facultyId, departmentId, academicYearId: facultyId === general.id ? year1.id : null },
    });
    return created;
  };
  const student = await studentOf('01055500010', 'Portal Fixture Student', general.id, prep.id);
  const peer = await studentOf('01055500011', 'Peer Fixture Student', general.id, prep.id);
  const outsider = await studentOf('01055500012', 'Programs Fixture Student', programs.id, cce.id);
  const disabled = await studentOf('01055500013', 'Disabled Fixture Student', general.id, prep.id, { status: 'DISABLED' });

  // --- Courses ---------------------------------------------------------------
  const scope = { universityId: uni.id, facultyId: general.id };
  const mechanics = await course({ title: 'Mechanics IT', teacherId: teacherOne.id, price: 1000, ...scope }, ['Statics', 'Dynamics', 'Fluids', 'Revision']);
  const [statics, dynamics, fluids] = mechanics.sections;
  const part1 = await prisma.coursePart.create({
    data: {
      courseId: mechanics.id,
      title: 'Part 1 — Before midterm',
      sortOrder: 1,
      pricingModel: 'PERCENTAGE',
      pricePercent: 60,
      sections: { connect: [{ id: statics.id }, { id: dynamics.id }] },
    },
  });
  const part2 = await prisma.coursePart.create({
    data: {
      courseId: mechanics.id,
      title: 'Part 2 — After midterm',
      sortOrder: 2,
      pricingModel: 'PERCENTAGE',
      pricePercent: 40,
      sections: { connect: { id: fluids.id } },
    },
  });

  const chemistry = await course({ title: 'Chemistry IT', teacherId: teacherOne.id, price: 600, ...scope }, ['Atoms', 'Bonds']);
  const physics = await course({ title: 'Physics IT', teacherId: teacherTwo.id, price: 700, ...scope }, ['Waves']);
  const maths = await course({ title: 'Maths IT', teacherId: teacherTwo.id, price: 800, ...scope }, ['Calculus']);
  const free = await course({ title: 'Study Skills IT', teacherId: teacherOne.id, price: null, isFree: true, enrollmentMethods: ['FREE'], ...scope }, ['Welcome']);
  const programsOnly = await course(
    { title: 'Networks IT', teacherId: teacherOne.id, price: 500, universityId: uni.id, facultyId: programs.id },
    ['Layers'],
  );
  const draft = await course({ title: 'Unreleased IT', teacherId: teacherOne.id, price: 500, status: 'DRAFT', publishedAt: null, ...scope }, ['Soon']);

  // --- Library ---------------------------------------------------------------
  const material = await prisma.libraryMaterial.create({
    data: {
      title: 'Mechanics Revision Papers IT',
      titleAr: 'مراجعات الميكانيكا',
      description: 'Activation portal integration fixture',
      status: 'PUBLISHED',
      isActive: true,
      universityId: uni.id,
      facultyId: general.id,
      academicYearId: year1.id,
      publishedAt: new Date(),
      createdById: admin.id,
    },
  });
  const libraryPart = (sortOrder, title, price, extra = {}) =>
    prisma.libraryPart.create({
      data: {
        materialId: material.id,
        title,
        sortOrder,
        price,
        objectKey: `library/fixture/${material.id}/${sortOrder}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 1024n,
        pageCount: 4,
        ...extra,
      },
    });
  const docSample = await libraryPart(1, 'Free sample', 0, { isPreview: true });
  const docCheap = await libraryPart(2, 'Chapter 1 papers', 40);
  const docDear = await libraryPart(3, 'Chapter 2 papers', 500);
  const programsMaterial = await prisma.libraryMaterial.create({
    data: {
      title: 'Networks Papers IT',
      status: 'PUBLISHED',
      isActive: true,
      universityId: uni.id,
      facultyId: programs.id,
      publishedAt: new Date(),
      createdById: admin.id,
    },
  });
  await prisma.libraryPart.create({
    data: { materialId: programsMaterial.id, title: 'Programs only', sortOrder: 1, price: 10, objectKey: 'library/fixture/programs/1.pdf' },
  });

  // --- Cards, through the real admin API --------------------------------------
  const adminSession = await api('POST', '/auth/login', { body: { phone: admin.phone, password: PASSWORD } });
  const token = adminSession.accessToken;
  const generate = async (body) => (await api('POST', '/admin/codes/generate', { token, body })).codes;

  const part1Cards = await generate({ targetType: 'PART', coursePartId: part1.id, count: 3, priceAmount: 600, prefix: 'ITP1' });
  const part2Cards = await generate({ targetType: 'PART', coursePartId: part2.id, count: 1, priceAmount: 400, prefix: 'ITP2' });
  const staticsCards = await generate({ targetType: 'SECTION', sectionId: statics.id, count: 1, priceAmount: 300, prefix: 'ITSA' });
  const revisionCards = await generate({ targetType: 'SECTION', sectionId: mechanics.sections[3].id, count: 1, priceAmount: 200, prefix: 'ITSD' });
  const chemistryCards = await generate({ targetType: 'COURSE', courseId: chemistry.id, count: 5, priceAmount: 600, prefix: 'ITCH' });
  const teacherCards = await generate({ targetType: 'TEACHER', teacherId: teacherTwo.id, count: 1, priceAmount: 1200, prefix: 'ITT2' });
  const throwaway = await generate({ targetType: 'COURSE', courseId: chemistry.id, count: 1, prefix: 'ITXX' });

  const recharge = async (faceValue, count) =>
    (await api('POST', '/admin/recharge-codes/generate', { token, body: { faceValue, count, prefix: 'ITRC' } })).codes;
  const recharge100 = await recharge(100, 2);
  const recharge50 = await recharge(50, 1);

  // An expired card, a revoked card and a card somebody else already used.
  const [chemFull, chemExpired, chemRevoked, chemUsed, chemSpare] = chemistryCards;
  await prisma.accessCode.update({ where: { code: chemExpired }, data: { expiresAt: new Date(Date.now() - 86_400_000) } });
  const revokedRow = await prisma.accessCode.findUniqueOrThrow({ where: { code: chemRevoked }, select: { id: true } });
  await api('POST', `/admin/codes/${revokedRow.id}/revoke`, { token, body: { reason: 'integration fixture' } });
  const peerSession = await api('POST', '/auth/login', { body: { phone: peer.phone, password: PASSWORD } });
  await api('POST', `/courses/${chemistry.id}/redeem`, { token: peerSession.accessToken, body: { code: chemUsed } });

  // The seed's own attempts must not count against the tests' rate limits.
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 2 });
  await redis.flushdb();
  await redis.quit();

  const fixtures = {
    password: PASSWORD,
    backendUrl: BACKEND_URL,
    admin: { id: admin.id, phone: admin.phone },
    teacher: { id: teacherOne.id, phone: teacherOne.phone, name: teacherOne.fullName },
    teacherTwo: { id: teacherTwo.id, name: teacherTwo.fullName },
    student: { id: student.id, phone: student.phone, firstName: 'Portal' },
    peer: { id: peer.id, phone: peer.phone },
    outsider: { id: outsider.id, phone: outsider.phone },
    disabled: { id: disabled.id, phone: disabled.phone },
    courses: { mechanics, chemistry, physics, maths, free, programsOnly, draft },
    parts: { part1: { id: part1.id, title: part1.title }, part2: { id: part2.id, title: part2.title } },
    library: {
      material: { id: material.id, title: material.title },
      sample: { id: docSample.id, title: docSample.title },
      cheap: { id: docCheap.id, title: docCheap.title, price: 40 },
      dear: { id: docDear.id, title: docDear.title, price: 500 },
      programsMaterial: { id: programsMaterial.id, title: programsMaterial.title },
    },
    codes: {
      part1: part1Cards,
      part2: part2Cards[0],
      sectionStatics: staticsCards[0],
      sectionRevision: revisionCards[0],
      chemistryFull: chemFull,
      chemistryExpired: chemExpired,
      chemistryRevoked: chemRevoked,
      chemistryUsed: chemUsed,
      chemistrySpare: chemSpare,
      teacherTwo: teacherCards[0],
      throwaway: throwaway[0],
      recharge100,
      recharge50: recharge50[0],
    },
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(fixtures, null, 2));
  console.log(`fixtures written: ${OUT}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
