import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverScale, focusPosition, mediaUrl, pickWidth } from '../src/lib/site-images.ts';

test('requests round up to a stored width', () => {
  assert.equal(pickWidth(100), 640);
  assert.equal(pickWidth(1080), 1280);
  assert.equal(pickWidth(1920), 1920);
  assert.equal(pickWidth(3840), 3200);
});

test('media URLs point at the chosen width', () => {
  assert.equal(mediaUrl('/api/media/abc123def/lg', 1200), '/api/media/abc123def/1280');
  assert.equal(mediaUrl('/api/media/abc123def/960', 2000), '/api/media/abc123def/2560');
});

test('a 3:2 photo in a 4:5 frame is drawn wider than the frame', () => {
  assert.equal(coverScale({ w: 3000, h: 2000 }, 3 / 2), 1);
  assert.ok(Math.abs(coverScale({ w: 3000, h: 2000 }, 4 / 5) - 1.875) < 1e-9);
  assert.equal(coverScale({ w: 2000, h: 3000 }, 3 / 2), 1);
});

test('focus point becomes a clamped CSS position', () => {
  assert.equal(focusPosition(), '50% 50%');
  assert.equal(focusPosition({ x: 30.4, y: 120 }), '30% 100%');
});
