import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browseCompare, parseChapterName, sortChapters } from '../src/lib/drive/names.ts';

test('numeric prefixes set the order and are hidden', () => {
  assert.deepEqual(parseChapterName('01 Preparativos'), { name: 'Preparativos', order: 1 });
  assert.deepEqual(parseChapterName('2 - Ceremonia'), { name: 'Ceremonia', order: 2 });
  assert.deepEqual(parseChapterName('03_Fiesta'), { name: 'Fiesta', order: 3 });
  assert.deepEqual(parseChapterName('Retratos'), { name: 'Retratos', order: null });
  assert.deepEqual(parseChapterName('2026'), { name: '2026', order: null });
});

test('prefixed chapters first, then alphabetical', () => {
  const out = sortChapters([{ rawName: 'Retratos' }, { rawName: '10 Noche' }, { rawName: '02 Ceremonia' }, { rawName: 'Detalles' }, { rawName: '1 Preparativos' }]);
  assert.deepEqual(out.map((c) => c.name), ['Preparativos', 'Ceremonia', 'Noche', 'Detalles', 'Retratos']);
  assert.deepEqual(out.map((c) => c.sort), [0, 1, 2, 3, 4]);
});

test('folder browser: dated folders newest first, months in calendar order', () => {
  assert.deepEqual(['2025', '2026', 'Misc'].sort(browseCompare), ['2026', '2025', 'Misc']);
  assert.deepEqual(['10 October', '02 February', '01 January'].sort(browseCompare), ['01 January', '02 February', '10 October']);
  assert.deepEqual(['2026-01-01 San Jose', '2026-01-18 Retratos'].sort(browseCompare), ['2026-01-18 Retratos', '2026-01-01 San Jose']);
});
