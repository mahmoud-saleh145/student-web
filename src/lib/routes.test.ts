import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { toWebRoute } from './routes.ts';

describe('toWebRoute', () => {
  test('maps the mobile course and lesson paths onto the web ones', () => {
    // Followed verbatim, both of these opened a 404 from search and from
    // every notification that pointed at a course or a lesson.
    assert.equal(toWebRoute('/course/cmuen2v290024dc01cd50jqn9', '/x'), '/courses/cmuen2v290024dc01cd50jqn9');
    assert.equal(toWebRoute('/lesson/cmuhr6sgf0005hl0108j9sioh', '/x'), '/lessons/cmuhr6sgf0005hl0108j9sioh');
  });

  test('passes through routes the web already serves under the same name', () => {
    for (const r of ['/viewer/abc', '/support/abc', '/courses?teacherId=abc', '/courses/abc', '/notifications']) {
      assert.equal(toWebRoute(r, '/x'), r);
    }
  });

  test('falls back instead of pushing an unknown or unsafe route', () => {
    for (const r of [null, undefined, '', 'course/abc', '//evil.example/x', 'https://evil.example', '/admin/users', '/course/abc/extra']) {
      assert.equal(toWebRoute(r as string, '/fallback'), '/fallback', String(r));
    }
  });
});
