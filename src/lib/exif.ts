/*
 * When a photo was taken, read from its EXIF data. Cameras write the time as
 * "YYYY:MM:DD HH:MM:SS" in the camera's own clock with no time zone, so it is
 * stored as if it were UTC: good for putting photos in order, which is all the
 * gallery uses it for.
 */

const EXIF_TIME = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;

/** "2026:01:01 14:30:05" (EXIF, or Drive's imageMediaMetadata.time) to a Date. */
export function parseExifTime(s: string | null | undefined): Date | null {
  const m = String(s ?? '').match(EXIF_TIME);
  if (!m) return null;
  const [y, mo, d, h, mi, se] = m.slice(1).map(Number);
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, mo - 1, d, h, mi, se);
  return Number.isFinite(t) ? new Date(t) : null;
}

const TAG_EXIF_IFD = 0x8769;
const TAG_DATETIME = 0x0132;
const TAG_DATETIME_ORIGINAL = 0x9003;

/**
 * DateTimeOriginal (falling back to DateTime) from a raw EXIF block, as sharp's
 * metadata().exif returns it ("Exif\0\0" then a TIFF header). Never throws.
 */
export function exifTakenAt(exif: Buffer | Uint8Array | null | undefined): Date | null {
  try {
    if (!exif || exif.length < 14) return null;
    const b = Buffer.from(exif.buffer, exif.byteOffset, exif.byteLength);
    const base = b.toString('latin1', 0, 4) === 'Exif' ? 6 : 0;
    const order = b.toString('latin1', base, base + 2);
    if (order !== 'II' && order !== 'MM') return null;
    const le = order === 'II';
    const u16 = (o: number) => (le ? b.readUInt16LE(base + o) : b.readUInt16BE(base + o));
    const u32 = (o: number) => (le ? b.readUInt32LE(base + o) : b.readUInt32BE(base + o));
    const inside = (o: number, n: number) => o >= 0 && base + o + n <= b.length;

    /** The entries of one IFD as tag -> value offset (or inline value) and count. */
    const ifd = (off: number) => {
      const out = new Map<number, { type: number; count: number; at: number }>();
      if (!inside(off, 2)) return out;
      const n = u16(off);
      for (let i = 0; i < n && inside(off + 2 + i * 12, 12); i++) {
        const e = off + 2 + i * 12;
        out.set(u16(e), { type: u16(e + 2), count: u32(e + 4), at: e + 8 });
      }
      return out;
    };
    const ascii = (e: { type: number; count: number; at: number } | undefined) => {
      if (!e || e.type !== 2 || e.count < 19) return null;
      const off = e.count > 4 ? u32(e.at) : e.at;
      if (!inside(off, 19)) return null;
      return b.toString('latin1', base + off, base + off + 19);
    };

    const ifd0 = ifd(u32(4));
    const sub = ifd0.get(TAG_EXIF_IFD);
    const exifIfd = sub ? ifd(u32(sub.at)) : new Map();
    return parseExifTime(ascii(exifIfd.get(TAG_DATETIME_ORIGINAL))) ?? parseExifTime(ascii(ifd0.get(TAG_DATETIME)));
  } catch {
    return null;
  }
}
