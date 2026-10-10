import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { registerAcademicSchema } from "./schemas.ts";

/**
 * The registration payload.
 *
 * The shape of this suite is the change: the previous version asserted that a
 * study type was REQUIRED and was carried into the payload. That field is what
 * let a student pick their own academic progression system — "General" showed
 * years, "Programs" showed levels — which is the one decision the product says
 * belongs to the college.
 *
 * It was also a live incompatibility rather than a design wart: the backend
 * required `studyType`, so the mobile client, which never sent it, could not
 * register at all against the same API.
 */

const academic = {
  universityId: "mansoura",
  facultyId: "engineering",
  departmentId: "civil",
  academicYearId: "second",
  gender: "MALE",
};

describe("registration academic payload", () => {
  it("accepts university, college, department and rung with no study type", () => {
    const parsed = registerAcademicSchema.parse(academic);
    assert.equal(parsed.universityId, "mansoura");
    assert.equal(parsed.facultyId, "engineering");
    assert.equal(parsed.departmentId, "civil");
    assert.equal(parsed.academicYearId, "second");
  });

  it("does not carry a study type", () => {
    // Not merely ignored: absent from the parsed output, so it cannot be
    // forwarded to the API even if some caller still holds the old state.
    assert.equal("studyType" in registerAcademicSchema.parse(academic), false);
  });

  it("drops a study type supplied by a stale client rather than rejecting it", () => {
    // A published build must not start failing registration the moment this
    // ships. The value is ignored, which is safe: the backend never used it to
    // resolve the academic system.
    const parsed = registerAcademicSchema.parse({
      ...academic,
      studyType: "PROGRAMS",
    });
    assert.equal("studyType" in parsed, false);
  });

  it("requires a university, a college, a department and a rung", () => {
    for (const key of [
      "universityId",
      "facultyId",
      "departmentId",
      "academicYearId",
    ] as const) {
      const result = registerAcademicSchema.safeParse({
        ...academic,
        [key]: "",
      });
      assert.equal(result.success, false, `${key} should be required`);
      if (!result.success) {
        assert.ok(
          result.error.issues.some((issue) => issue.path[0] === key),
          `${key} should be reported on ${key}`,
        );
      }
    }
  });

  it("requires a gender", () => {
    assert.equal(
      registerAcademicSchema.safeParse({ ...academic, gender: "" }).success,
      false,
    );
    assert.equal(
      registerAcademicSchema.safeParse({ ...academic, gender: "OTHER" })
        .success,
      false,
    );
  });

  it("rejects an academic system the student tries to choose", () => {
    // The payload has no field for one, so an attempt to send it is simply
    // dropped. Asserted explicitly because silently accepting a client's guess
    // would be the failure mode: a student sending `academicSystem: 'LEVEL'`
    // must not influence anything.
    const parsed = registerAcademicSchema.parse({
      ...academic,
      academicSystem: "LEVEL",
    });
    assert.equal("academicSystem" in parsed, false);
  });
});
