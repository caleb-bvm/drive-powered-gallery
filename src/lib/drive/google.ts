import 'server-only';
import type { Readable } from 'node:stream';
import { drive as driveApi, type drive_v3 } from '@googleapis/drive';
import { GoogleAuth } from 'google-auth-library';
import type { DriveSource, DriveFolder, DriveImage, FolderHit, FolderListing, FolderScan } from './types';
import { IMAGE_MIME } from './types';
import { browseCompare, naturalCompare, sortChapters } from './names';
import { parseExifTime } from '@/lib/exif';

/*
 * Google Drive through a service account. Michael shares his photo library
 * folder (DRIVE_ROOT_FOLDER_ID, e.g. "Photo Repository") with the service
 * account's email as Viewer; the Studio browses that folder and everything
 * under it, and nothing else. Nothing here is ever sent to a browser.
 */

const FOLDER = 'application/vnd.google-apps.folder';
const META_TTL = 10 * 60_000;

/** A value inside a Drive query string literal */
const literal = (v: string) => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

function parseKey(raw: string) {
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return JSON.parse(text) as { client_email: string; private_key: string };
}

export class GoogleDrive implements DriveSource {
  private api: drive_v3.Drive;
  private auth: GoogleAuth;

  constructor(
    private rootFolderId: string,
    serviceAccountJson: string,
  ) {
    if (!rootFolderId || !serviceAccountJson) {
      throw new Error('DRIVE_ROOT_FOLDER_ID and a service account key (GOOGLE_SERVICE_ACCOUNT_FILE or GOOGLE_SERVICE_ACCOUNT_JSON) are required when DRIVE_MODE=google');
    }
    const credentials = parseKey(serviceAccountJson);
    const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
    this.auth = auth;
    this.api = driveApi({ version: 'v3', auth });
  }

  private async children(parentId: string): Promise<drive_v3.Schema$File[]> {
    const out: drive_v3.Schema$File[] = [];
    let pageToken: string | undefined;
    do {
      const res = await this.withRetry(() =>
        this.api.files.list({
          q: `'${literal(parentId)}' in parents and trashed = false`,
          fields: 'nextPageToken, files(id, name, mimeType, size, md5Checksum, imageMediaMetadata(time))',
          pageSize: 1000,
          pageToken,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        }),
      );
      out.push(...(res.data.files ?? []));
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    return out;
  }

  /** Back off on rate limits (403 userRateLimitExceeded / 429). */
  private async withRetry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
    for (let i = 0; ; i++) {
      try {
        return await fn();
      } catch (e) {
        const status = (e as { code?: number; status?: number }).code ?? (e as { status?: number }).status;
        if (i >= tries - 1 || !(status === 429 || status === 403 || (status && status >= 500))) throw e;
        await new Promise((r) => setTimeout(r, 2 ** i * 500 + Math.random() * 300));
      }
    }
  }

  private meta = new Map<string, { at: number; id: string; name: string; parent: string | null }>();

  private async info(id: string) {
    const hit = this.meta.get(id);
    if (hit && Date.now() - hit.at < META_TTL) return hit;
    const res = await this.withRetry(() => this.api.files.get({ fileId: id, fields: 'id, name, parents, mimeType', supportsAllDrives: true }));
    const entry = { at: Date.now(), id: res.data.id ?? id, name: res.data.name ?? '', parent: res.data.parents?.[0] ?? null };
    this.meta.set(id, entry);
    if (entry.id !== id) this.meta.set(entry.id, entry);
    return entry;
  }

  /** Root → folder, or null when the folder isn't inside the library. */
  private async pathTo(id: string): Promise<DriveFolder[] | null> {
    const out: DriveFolder[] = [];
    let cur: string | null = id;
    for (let depth = 0; cur && depth < 40; depth++) {
      const m: { id: string; name: string; parent: string | null } | null = await this.info(cur).catch(() => null);
      if (!m) return null;
      out.unshift({ id: m.id, name: m.name });
      if (m.id === this.rootFolderId || cur === this.rootFolderId) return out;
      cur = m.parent;
    }
    return null;
  }

  async listFolder(folderId?: string): Promise<FolderListing> {
    const id = folderId || this.rootFolderId;
    const path = await this.pathTo(id);
    if (!path && id === this.rootFolderId) {
      throw new Error(
        "Can't open the library folder in Drive. Share it with the service account's email as Viewer, and check that DRIVE_ROOT_FOLDER_ID is its ID.",
      );
    }
    if (!path) throw new Error('That folder is not inside your photo library.');
    const files = await this.children(id);
    const images = this.toImages(files);
    return {
      folder: path[path.length - 1],
      path,
      folders: files
        .filter((f) => f.mimeType === FOLDER)
        .map((f) => ({ id: f.id!, name: f.name ?? '' }))
        .sort((a, b) => browseCompare(a.name, b.name)),
      imageCount: images.length,
      imageBytes: images.reduce((s, i) => s + i.size, 0),
      otherFiles: files.length - images.length - files.filter((f) => f.mimeType === FOLDER).length,
    };
  }

  async searchFolders(text: string): Promise<FolderHit[]> {
    const t = text.trim();
    if (!t) return [];
    const res = await this.withRetry(() =>
      this.api.files.list({
        q: `mimeType = '${FOLDER}' and trashed = false and name contains '${literal(t)}'`,
        fields: 'files(id, name, parents)',
        pageSize: 60,
        corpora: 'allDrives',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      }),
    );
    const hits: FolderHit[] = [];
    for (const f of res.data.files ?? []) {
      if (!f.id || f.id === this.rootFolderId) continue;
      this.meta.set(f.id, { at: Date.now(), id: f.id, name: f.name ?? '', parent: f.parents?.[0] ?? null });
      const path = await this.pathTo(f.id);
      if (path) hits.push({ id: f.id, name: f.name ?? '', path });
      if (hits.length >= 30) break;
    }
    return hits.sort((a, b) => browseCompare(a.name, b.name));
  }

  private toImages(files: drive_v3.Schema$File[]): DriveImage[] {
    return files
      .filter((f) => f.mimeType && IMAGE_MIME.has(f.mimeType))
      .map((f) => ({ id: f.id!, name: f.name ?? f.id!, mime: f.mimeType!, size: Number(f.size ?? 0), md5: f.md5Checksum ?? null, takenAt: parseExifTime(f.imageMediaMetadata?.time) }))
      .sort((a, b) => naturalCompare(a.name, b.name));
  }

  async scanFolder(folderId: string): Promise<FolderScan> {
    const meta = await this.withRetry(() =>
      this.api.files.get({ fileId: folderId, fields: 'id, name, parents', supportsAllDrives: true }),
    );
    const files = await this.children(folderId);
    const looseImages = this.toImages(files);
    const subs = sortChapters(files.filter((f) => f.mimeType === FOLDER).map((f) => ({ rawName: f.name ?? '', id: f.id! })));
    const chapters = [];
    for (const s of subs) {
      chapters.push({ driveFolderId: s.id, name: s.name, sort: s.sort, images: this.toImages(await this.children(s.id)) });
    }
    const all = [...looseImages, ...chapters.flatMap((c) => c.images)];
    return {
      folder: { id: folderId, name: meta.data.name ?? '' },
      looseImages,
      chapters: chapters.filter((c) => c.images.length),
      photoCount: all.length,
      totalBytes: all.reduce((s, i) => s + i.size, 0),
    };
  }

  async openOriginal(fileId: string): Promise<Readable> {
    const res = await this.withRetry(() =>
      this.api.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'stream' }),
    );
    return res.data as unknown as Readable;
  }

  async thumbnail(fileId: string): Promise<Buffer | null> {
    const meta = await this.withRetry(() => this.api.files.get({ fileId, fields: 'thumbnailLink', supportsAllDrives: true }));
    const link = meta.data.thumbnailLink;
    if (!link) return null;
    const token = await this.auth.getAccessToken();
    const res = await fetch(link.replace(/=s\d+$/, '=s400'), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  }
}
