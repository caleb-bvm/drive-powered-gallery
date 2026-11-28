import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_CATEGORIES, CATEGORY_GROUPS, categoryLabel, groupCategories, slugify } from '../src/lib/categories.ts';

test('built-in ids are unique, url-safe and keep the original album types', () => {
  const ids = BUILTIN_CATEGORIES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9-]+$/);
  for (const old of ['wedding', 'xv', 'portrait', 'family', 'commercial']) assert.ok(ids.includes(old), old);
  assert.ok(!ids.includes('other'));
});

test('every built-in has both names and a known group', () => {
  const groups = new Set(CATEGORY_GROUPS.map((g) => g.id));
  for (const c of BUILTIN_CATEGORIES) {
    assert.ok(c.es.trim() && c.en.trim(), c.id);
    assert.ok(groups.has(c.group) && c.group !== 'custom', c.id);
  }
});

test('labels follow the locale and fall back sensibly', () => {
  assert.equal(categoryLabel('wedding', 'es'), 'Boda');
  assert.equal(categoryLabel('wedding', 'en'), 'Wedding');
  assert.equal(categoryLabel('gone', 'es'), 'Sesión');
  assert.equal(categoryLabel('other', 'en'), 'Session');
  const custom = [{ id: 'autos', es: 'Autos clásicos', en: '', group: 'custom' as const }];
  assert.equal(categoryLabel('autos', 'en', custom), 'Autos clásicos');
});

test('groups keep display order and skip empty ones', () => {
  const g = groupCategories(BUILTIN_CATEGORIES);
  assert.deepEqual(g.map((x) => x.id), ['celebrations', 'people', 'events', 'commercial', 'places', 'art']);
});

test('slugify strips accents and symbols', () => {
  assert.equal(slugify('Fotografía de Autos  Clásicos!'), 'fotografia-de-autos-clasicos');
  assert.equal(slugify('¿¿??'), '');
});
