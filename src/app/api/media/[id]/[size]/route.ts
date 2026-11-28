import { getStore, mediaKey } from '@/lib/storage';
import { SITE_WIDTHS } from '@/lib/site-images';

const headers = (contentType: string, length: number) => ({
  'Content-Type': contentType,
  'Content-Length': String(length),
  'Cache-Control': 'public, max-age=31536000, immutable',
  Vary: 'Accept',
});

/**
 * Public site images uploaded in the Studio (hero slides, selected work, portrait).
 * `/api/media/:id/:width` serves the pre-encoded file for that width, AVIF when
 * the browser accepts it, otherwise WebP. Photos smaller than the width asked
 * for get their largest copy; uploads from before the size set fall back to lg.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; size: string }> }) {
  const { id, size } = await params;
  if (!/^[\w-]{6,40}$/.test(id)) return new Response('Not found', { status: 404 });
  const store = getStore();

  if (size === 'lg' || size === 'sm') {
    const obj = await store.get(mediaKey(id, size));
    if (!obj) return new Response('Not found', { status: 404 });
    return new Response(new Uint8Array(obj.body), { headers: headers(obj.contentType, obj.body.length) });
  }

  const want = Number(size);
  if (!(SITE_WIDTHS as readonly number[]).includes(want)) return new Response('Not found', { status: 404 });
  const avif = (req.headers.get('accept') ?? '').includes('image/avif');
  const formats = avif ? (['avif', 'webp'] as const) : (['webp'] as const);
  for (const w of SITE_WIDTHS.filter((x) => x <= want).reverse()) {
    for (const f of formats) {
      const obj = await store.get(mediaKey(id, w, f));
      if (obj) return new Response(new Uint8Array(obj.body), { headers: headers(obj.contentType, obj.body.length) });
    }
  }
  const obj = await store.get(mediaKey(id, 'lg'));
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(obj.body), { headers: headers(obj.contentType, obj.body.length) });
}
