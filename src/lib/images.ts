import 'server-only';
import sharp from 'sharp';

sharp.cache(false);
sharp.concurrency(2);

export interface Previews {
  lg: Buffer;
  sm: Buffer;
  width: number;
  height: number;
}

/**
 * Web-sized copies of an original: 2400 px and 640 px on the long edge, WebP.
 * EXIF orientation is applied, then all metadata (GPS included) is dropped.
 */
export async function makePreviews(original: Buffer): Promise<Previews> {
  const base = sharp(original, { failOn: 'none', limitInputPixels: 400_000_000 }).rotate();
  const meta = await base.clone().metadata();
  const lg = await base.clone().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const sm = await base.clone().resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = rotated ? meta.height ?? lg.info.height : meta.width ?? lg.info.width;
  const height = rotated ? meta.width ?? lg.info.width : meta.height ?? lg.info.height;
  return { lg: lg.data, sm, width, height };
}

export async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(typeof c === 'string' ? Buffer.from(c) : (c as Buffer));
  return Buffer.concat(chunks);
}

export interface SiteVariants {
  width: number;
  height: number;
  /** Data URL of a ~24 px wide blurred copy, for the loading placeholder. */
  blur: string;
  /** One entry per stored size; `width` is the size name it is stored under. */
  files: { width: number; avif: Buffer; webp: Buffer }[];
}

/**
 * Every size the public site asks for, encoded once at upload time. The
 * original (often 6000 x 4000 and over 20 MB) is decoded a single time, scaled
 * to the largest width needed, and the smaller sizes are made from that.
 * Widths larger than the photo itself are skipped.
 */
export async function makeSiteVariants(original: Buffer, widths: readonly number[]): Promise<SiteVariants> {
  const src = sharp(original, { failOn: 'none', limitInputPixels: 400_000_000 }).rotate();
  const meta = await src.clone().metadata();
  const rotated = (meta.orientation ?? 1) >= 5;
  const fullW = (rotated ? meta.height : meta.width) ?? 0;
  const fullH = (rotated ? meta.width : meta.height) ?? 0;
  if (!fullW || !fullH) throw new Error('That file is not an image we can read.');

  const top = Math.min(fullW, widths[widths.length - 1]);
  const master = await src
    .clone()
    .resize({ width: top, withoutEnlargement: true })
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  const fromMaster = () =>
    sharp(master.data, { raw: { width: master.info.width, height: master.info.height, channels: master.info.channels } });

  const sizes = [...widths.filter((w) => w < top), top];
  const files: SiteVariants['files'] = [];
  for (const w of sizes) {
    const scaled = w === top ? fromMaster() : fromMaster().resize({ width: w });
    const [avif, webp] = await Promise.all([
      scaled.clone().avif({ quality: 60, effort: 3 }).toBuffer(),
      scaled.clone().webp({ quality: 82, effort: 4, smartSubsample: true }).toBuffer(),
    ]);
    // The top copy is filed under the next size up, so a request for any larger size finds it.
    files.push({ width: w === top ? (widths.find((x) => x >= top) ?? top) : w, avif, webp });
  }

  const tiny = await fromMaster().resize({ width: 24 }).blur(1.2).webp({ quality: 40 }).toBuffer();
  return { width: master.info.width, height: master.info.height, blur: `data:image/webp;base64,${tiny.toString('base64')}`, files };
}
