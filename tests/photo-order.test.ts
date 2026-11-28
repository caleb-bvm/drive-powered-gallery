import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { manualOrder, sortForClient, syncedOrder } from '../src/lib/photo-order.ts';
import { exifTakenAt, parseExifTime } from '../src/lib/exif.ts';

const photos = [
  { id: 'a', chapterId: null, sort: 0 },
  { id: 'b', chapterId: null, sort: 1 },
  { id: 'c', chapterId: 'ch1', sort: 2 },
  { id: 'd', chapterId: 'ch1', sort: 3 },
  { id: 'e', chapterId: 'ch1', sort: 4 },
  { id: 'f', chapterId: 'ch2', sort: 5 },
];
const sorted = (m: Map<string, number>) => [...m].sort((x, y) => x[1] - y[1]).map((x) => x[0]);

test("Michael's order changes places only inside a chapter", () => {
  // f is listed first, but it stays in chapter 2, after chapter 1
  const m = manualOrder(photos, ['f', 'e', 'c', 'd', 'b', 'a'], ['ch1', 'ch2']);
  assert.deepEqual(sorted(m), ['b', 'a', 'e', 'c', 'd', 'f']);
});

test('photos left out of the order keep their old place after the listed ones', () => {
  const m = manualOrder(photos, ['d', 'zzz'], ['ch1', 'ch2']);
  assert.deepEqual(sorted(m), ['a', 'b', 'd', 'c', 'e', 'f']);
});

test('a sync keeps a hand-set order and adds new photos at the end of their chapter', () => {
  const existing = new Map([
    ['A', { sort: 1, chapterId: null }],
    ['B', { sort: 0, chapterId: null }],
    ['C', { sort: 3, chapterId: 'ch1' }],
    ['D', { sort: 2, chapterId: 'ch1' }],
  ]);
  const fresh = [
    { driveFileId: 'A', chapterId: null },
    { driveFileId: 'B', chapterId: null },
    { driveFileId: 'C', chapterId: 'ch1' },
    { driveFileId: 'N', chapterId: 'ch1' },
    { driveFileId: 'D', chapterId: 'ch1' },
  ];
  assert.deepEqual(sorted(syncedOrder(fresh, existing, true)), ['B', 'A', 'D', 'C', 'N']);
  assert.deepEqual(sorted(syncedOrder(fresh, existing, false)), ['A', 'B', 'C', 'N', 'D']);
});

test('clients can sort by date taken or name without losing album order for ties', () => {
  const list = [
    { name: 'IMG_10.jpg', takenAt: '2026-01-01T12:00:00.000Z' },
    { name: 'IMG_2.jpg', takenAt: null },
    { name: 'IMG_1.jpg', takenAt: '2026-01-01T10:00:00.000Z' },
  ];
  assert.equal(sortForClient(list, 'album'), list);
  assert.deepEqual(sortForClient(list, 'taken').map((p) => p.name), ['IMG_1.jpg', 'IMG_10.jpg', 'IMG_2.jpg']);
  assert.deepEqual(sortForClient(list, 'name').map((p) => p.name), ['IMG_1.jpg', 'IMG_2.jpg', 'IMG_10.jpg']);
});

test('EXIF capture time is read from the camera clock', async () => {
  assert.equal(parseExifTime('2026:01:01 14:30:05')?.toISOString(), '2026-01-01T14:30:05.000Z');
  assert.equal(parseExifTime('0000:00:00 00:00:00'), null);
  assert.equal(parseExifTime(undefined), null);
  {
    const jpg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } })
      .jpeg()
      .withExif({ IFD0: { DateTime: '2025:12:31 23:00:00' }, IFD2: { DateTimeOriginal: '2025:06:07 08:09:10' } })
      .toBuffer();
    const { exif } = await sharp(jpg).metadata();
    assert.equal(exifTakenAt(exif)?.toISOString(), '2025-06-07T08:09:10.000Z');
  }
  assert.equal(exifTakenAt(Buffer.from('nonsense')), null);
});
