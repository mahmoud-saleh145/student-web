import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { registerAcademicSchema } from './schemas.ts';

const classification = { universityId: 'mansoura', facultyId: 'engineering', departmentId: 'civil', academicYearId: 'second', gender: 'MALE' };

describe('registration study type', () => {
  for (const studyType of ['GENERAL', 'PROGRAMS']) {
    it(`includes the selected ${studyType} type in the registration payload`, () => {
      assert.equal(registerAcademicSchema.parse({ ...classification, studyType }).studyType, studyType);
    });
  }
  it('requires an explicit study type', () => {
    const result = registerAcademicSchema.safeParse(classification);
    assert.equal(result.success, false);
    if (!result.success) assert.ok(result.error.issues.some((issue) => issue.path[0] === 'studyType'));
  });
  it('rejects unknown or multiple study types', () => {
    for (const studyType of ['', 'OTHER', ['GENERAL', 'PROGRAMS']]) {
      assert.equal(registerAcademicSchema.safeParse({ ...classification, studyType }).success, false);
    }
  });
  it('requires a department and year after changing classification', () => {
    assert.equal(registerAcademicSchema.safeParse({ ...classification, studyType: 'GENERAL', departmentId: '', academicYearId: '' }).success, false);
  });
});
