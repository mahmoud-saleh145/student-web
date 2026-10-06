import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { dictionaries } from './dictionaries.ts';

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(entry) && !entry.includes('dictionaries')) out.push(p);
  }
  return out;
}

describe('translation dictionary', () => {
  test('every key the UI asks for is defined', () => {
    // Two keys shipped undefined and rendered their own names on screen: a
    // student reading the course page saw the literal "courses.lastUpdated".
    // `translate()` falls back to the key, so nothing throws — only the reader
    // notices, which is why this is a test rather than a type.
    const used = new Set<string>();
    for (const file of sources('src')) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'/g)) {
        const key = match[1];
        if (key) used.add(key);
      }
    }
    const missing = [...used].filter((k) => !(k in dictionaries.en)).sort();
    assert.deepEqual(missing, [], `keys used in the UI but absent from the dictionary: ${missing.join(', ')}`);
  });

  test('Arabic covers every English key', () => {
    const missing = Object.keys(dictionaries.en).filter((k) => !(k in dictionaries.ar));
    assert.deepEqual(missing, [], `untranslated: ${missing.join(', ')}`);
  });
});
