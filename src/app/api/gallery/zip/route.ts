import { and, asc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { currentGallery } from '@/lib/session';
import { getDrive } from '@/lib/drive';
import { logEvent } from '@/lib/albums';
import { describeVisitor } from '@/lib/request';
import { splitParts } from '@/lib/zipparts';
import { zipStream } from '@/lib/zip';
import { attachment, iterToWeb, slug } from '@/lib/http';

export const maxDuration = 800;

type Gallery = NonNullable<Awaited<ReturnType<typeof currentGallery>>>;
type Photo = typeof schema.photos.$inferSelect;

/** Most photos one hand-picked ZIP request can name. */
const MAX_PICKED = 5000;

async function readyPhotos(albumId: string) {
  const db = await getDb();
  const photos = await db
    .select()
    .from(schema.photos)
    .where(and(eq(schema.photos.albumId, albumId)))
    .orderBy(asc(schema.photos.sort));
  return photos.filter((p) => p.previewVersion > 0);
}

/** Stream the chosen originals as one ZIP, foldered by chapter. */
async function zipResponse(g: Gallery, chosen: Photo[], label: string, filename: string) {
  const db = await getDb();
  const albumId = g.album.id;
  const chapters = await db.select().from(schema.chapters).where(eq(schema.chapters.albumId, albumId));
  const folder = new Map(chapters.map((c) => [c.id, `${String(c.sort + 1).padStart(2, '0')} ${c.name}`.replace(/[\\/:*?"<>|]/g, '-')]));
  const used = new Set<string>();
  const drive = getDrive();
  const entries = chosen.map((p) => {
    let name = p.chapterId && folder.get(p.chapterId) ? `${folder.get(p.chapterId)}/${p.name}` : p.name;
    for (let i = 2; used.has(name); i++) name = name.replace(/(\.[^.]+)?$/, ` (${i})$1`);
    used.add(name);
    return { name, open: () => drive.openOriginal(p.driveFileId) };
  });

  await logEvent(albumId, 'zip', [label, `${chosen.length} photos`, await describeVisitor()].join(', '));
  return new Response(iterToWeb(zipStream(entries)), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': attachment(filename),
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}

const partName = (base: string, part: number, total: number) => (total > 1 ? `${base}-parte-${part}-de-${total}.zip` : `${base}.zip`);

/**
 * Originals as a ZIP, streamed: the first bytes leave as soon as the first
 * file arrives from Drive. Big galleries come in parts of about 2 GB.
 */
export async function GET(req: Request) {
  const g = await currentGallery();
  if (!g || g.role !== 'client' || !g.album.allowZip) return new Response('Unauthorized', { status: 401 });
  const u = new URL(req.url);
  const set = u.searchParams.get('set') === 'favs' ? 'favs' : 'all';
  const part = Math.max(1, Number(u.searchParams.get('part') ?? 1) || 1);

  let photos = await readyPhotos(g.album.id);
  if (set === 'favs') {
    const db = await getDb();
    const favs = new Set((await db.select().from(schema.favourites).where(eq(schema.favourites.albumId, g.album.id))).map((f) => f.photoId));
    photos = photos.filter((p) => favs.has(p.id));
  }
  const parts = splitParts(photos);
  const chosen = parts[part - 1];
  if (!chosen) return new Response('Not found', { status: 404 });

  const base = `${slug(g.album.name)}${set === 'favs' ? '-favoritas' : ''}`;
  return zipResponse(g, chosen, `${set === 'favs' ? 'Favourites' : 'All'}, part ${part} of ${parts.length}`, partName(base, part, parts.length));
}

/**
 * A ZIP of photos the client picked by hand. Sent as a form post (the list
 * can be long), so the browser saves the answer as a download and stays on
 * the gallery. The page splits big picks into parts and posts one at a time;
 * `part` and `parts` only name the file.
 */
export async function POST(req: Request) {
  const g = await currentGallery();
  if (!g || g.role !== 'client' || !g.album.allowZip) return new Response('Unauthorized', { status: 401 });
  const form = await req.formData().catch(() => null);
  const raw = form?.get('ids');
  if (typeof raw !== 'string') return new Response('Bad request', { status: 400 });
  const ids = new Set(raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX_PICKED));
  const part = Math.max(1, Number(form?.get('part') ?? 1) || 1);
  const total = Math.max(part, Number(form?.get('parts') ?? 1) || 1);

  const chosen = (await readyPhotos(g.album.id)).filter((p) => ids.has(p.id));
  if (!chosen.length) return new Response('Not found', { status: 404 });

  return zipResponse(g, chosen, `Selection, part ${part} of ${total}`, partName(`${slug(g.album.name)}-seleccion`, part, total));
}
