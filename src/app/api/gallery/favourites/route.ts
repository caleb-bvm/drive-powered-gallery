import { and, eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { currentGallery } from '@/lib/session';
import { logEvent } from '@/lib/albums';

/** Most photos one request can (un)favourite at once. */
const MAX_BATCH = 5000;

/**
 * Heart or un-heart photos. Body: `{ photoId, on }` for one photo, or
 * `{ photoIds: [...], on }` for a selection.
 */
export async function POST(req: Request) {
  const g = await currentGallery();
  if (!g) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { photoId?: unknown; photoIds?: unknown; on?: unknown } | null;
  if (!body || typeof body.on !== 'boolean') return Response.json({ error: 'bad request' }, { status: 400 });
  const asked =
    typeof body.photoId === 'string'
      ? [body.photoId]
      : Array.isArray(body.photoIds) && body.photoIds.every((x) => typeof x === 'string')
        ? (body.photoIds as string[]).slice(0, MAX_BATCH)
        : null;
  if (!asked?.length) return Response.json({ error: 'bad request' }, { status: 400 });

  const db = await getDb();
  const albumId = g.album.id;
  const photos = await db
    .select({ id: schema.photos.id, name: schema.photos.name })
    .from(schema.photos)
    .where(and(eq(schema.photos.albumId, albumId), inArray(schema.photos.id, asked)));
  if (!photos.length) return Response.json({ error: 'not found' }, { status: 404 });
  const ids = photos.map((p) => p.id);

  if (body.on) {
    await db
      .insert(schema.favourites)
      .values(ids.map((photoId) => ({ albumId, photoId })))
      .onConflictDoNothing();
  } else {
    await db.delete(schema.favourites).where(and(eq(schema.favourites.albumId, albumId), inArray(schema.favourites.photoId, ids)));
  }
  await logEvent(albumId, body.on ? 'favourite' : 'unfavourite', photos.length === 1 ? photos[0].name : `${photos.length} photos`);
  return Response.json({ ok: true, count: photos.length });
}
