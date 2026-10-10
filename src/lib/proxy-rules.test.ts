import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  isBlockedPath,
  isPublicReadPath,
  BLOCKED_PREFIXES,
} from "./proxy-rules.ts";

describe("proxy-rules — route filtering and staff shielding", () => {
  test("allows public browsing and student endpoints", () => {
    assert.equal(isBlockedPath("courses"), false);
    assert.equal(isBlockedPath("courses/course-123"), false);
    assert.equal(isBlockedPath("courses/course-123/parts"), false);
    assert.equal(isBlockedPath("lessons/lesson-456"), false);
    assert.equal(isBlockedPath("catalog/universities"), false);
    assert.equal(isBlockedPath("catalog/faculties"), false);
    assert.equal(isBlockedPath("search"), false);
    assert.equal(isBlockedPath("library/materials"), false);
    assert.equal(isBlockedPath("wallet"), false);
    assert.equal(isBlockedPath("notifications"), false);
    assert.equal(isBlockedPath("notifications/unread-count"), false);
    assert.equal(isBlockedPath("notifications/preferences"), false);
    assert.equal(isBlockedPath("profile"), false);
  });

  test("blocks administrative surfaces and staff prefixes", () => {
    assert.equal(isBlockedPath("admin/announcements"), true);
    assert.equal(isBlockedPath("admin/courses"), true);
    assert.equal(isBlockedPath("analytics/overview"), true);
    assert.equal(isBlockedPath("audit/logs"), true);
    assert.equal(isBlockedPath("security-events"), true);
    assert.equal(isBlockedPath("sessions/active"), true);
    assert.equal(isBlockedPath("master/users"), true);
    assert.equal(isBlockedPath("users/admin"), true);
    assert.equal(isBlockedPath("enrollments/admin"), true);
    assert.equal(isBlockedPath("storage/admin"), true);
    assert.equal(isBlockedPath("storage/internal"), true);
  });

  test("blocks payments webhooks from client proxying", () => {
    assert.equal(isBlockedPath("payments/webhooks/fawry"), true);
  });

  test("blocks direct auth endpoints from passing through general proxy", () => {
    assert.equal(isBlockedPath("auth/login"), true);
    assert.equal(isBlockedPath("auth/register"), true);
    assert.equal(isBlockedPath("auth/refresh"), true);
    assert.equal(isBlockedPath("auth/logout"), true);
  });

  test("blocks staff announcement broadcasts", () => {
    assert.equal(isBlockedPath("notifications/broadcast"), true);
    assert.equal(isBlockedPath("notifications/announcements"), true);
    assert.equal(isBlockedPath("notifications/course"), true);
  });

  test("blocks staff student roster and progress breakdown routes", () => {
    assert.equal(isBlockedPath("courses/course-123/students"), true);
    assert.equal(isBlockedPath("courses/course-123/students/export"), true);
    assert.equal(isBlockedPath("progress/courses/course-123/students"), true);
  });

  test("all BLOCKED_PREFIXES are recognized as blocked", () => {
    for (const prefix of BLOCKED_PREFIXES) {
      assert.equal(
        isBlockedPath(prefix),
        true,
        `prefix ${prefix} must be blocked`,
      );
    }
  });
});

describe("isPublicReadPath", () => {
  test("lets the registration lists through without a session", () => {
    // Without this the create-account form had four empty dropdowns.
    assert.equal(isPublicReadPath("GET", "catalog/universities"), true);
    assert.equal(
      isPublicReadPath("GET", "catalog/universities/abc123/faculties"),
      true,
    );
    assert.equal(
      isPublicReadPath("GET", "catalog/faculties/abc123/departments"),
      true,
    );
    assert.equal(isPublicReadPath("GET", "catalog/academic-years"), true);
    // The registration screen's resolved-system call. Without this the college's
    // year/level list would be unreachable before sign-in, which is exactly when
    // it is needed.
    assert.equal(isPublicReadPath("GET", "catalog/academic-selection"), true);
  });

  test("is GET only", () => {
    assert.equal(isPublicReadPath("POST", "catalog/universities"), false);
    assert.equal(isPublicReadPath("DELETE", "catalog/academic-years"), false);
    assert.equal(isPublicReadPath("POST", "catalog/academic-selection"), false);
  });

  test("does not expose the admin-only academic management routes", () => {
    // These are the write side of the academic structure. Making the read side
    // public must not drag them along: a prefix match on `catalog/` would.
    for (const p of [
      "catalog/academic-structures",
      "catalog/academic-systems",
      "catalog/tree",
      "catalog/universities/abc/departents",
    ]) {
      assert.equal(isPublicReadPath("GET", p), false, p);
    }
  });

  test("does not open anything else, including other catalog routes", () => {
    for (const p of [
      "courses",
      "home/feed",
      "catalog",
      "catalog/universities/x/faculties/y",
      "catalog/universities/../admin",
      "profile",
      "wallet",
    ]) {
      assert.equal(isPublicReadPath("GET", p), false, p);
    }
  });
});
