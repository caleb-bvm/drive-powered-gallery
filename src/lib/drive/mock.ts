import 'server-only';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Readable } from 'node:stream';
import sharp from 'sharp';
import type { DriveSource, DriveFolder, DriveImage, FolderHit, FolderListing, FolderScan } from './types';
import { browseCompare, naturalCompare, sortChapters } from './names';

/*
 * A stand-in for Google Drive that reads a folder on disk. The layout mirrors
 * Drive: MOCK_DRIVE_DIR is the photo library, with folders nested any depth
 * (year/month/event/chapter). IDs are the base64url of the path relative to
 * the root; the root itself is "root".
 */

const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.avif': 'image/avif',
};

export class MockDrive implements DriveSource {
  constructor(private root: string) {}

  private id(rel: string) {
    return Buffer.from(rel).toString('base64url');
  }

  private resolve(id: string) {
    const root = path.resolve(this.root);
    if (id === 'root') return root;
    const rel = Buffer.from(id, 'base64url').toString('utf8');
    const abs = path.resolve(root, rel);
    if (!abs.startsWith(root + path.sep)) throw new Error('Not found');
    return abs;
  }

  private folderOf(abs: string): DriveFolder {
    const rel = path.relative(path.resolve(this.root), abs);
    return rel ? { id: this.id(rel), name: path.basename(abs) } : { id: 'root', name: 'Mock Drive' };
  }

  private pathOf(abs: string): DriveFolder[] {
    const root = path.resolve(this.root);
    const out: DriveFolder[] = [];
    for (let cur = abs; ; cur = path.dirname(cur)) {
      out.unshift(this.folderOf(cur));
      if (cur === root || cur === path.dirname(cur)) break;
    }
    return out;
  }

  async listFolder(folderId?: string): Promise<FolderListing> {
    const abs = this.resolve(folderId || 'root');
    const entries = fs.existsSync(abs) ? await fsp.readdir(abs, { withFileTypes: true }) : [];
    const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'));
    const images = await this.images(abs).catch(() => []);
    const files = entries.filter((e) => e.isFile() && !e.name.startsWith('.'));
    return {
      folder: this.folderOf(abs),
      path: this.pathOf(abs),
      folders: dirs.map((d) => this.folderOf(path.join(abs, d.name))).sort((a, b) => browseCompare(a.name, b.name)),
      imageCount: images.length,
      imageBytes: images.reduce((s, i) => s + i.size, 0),
      otherFiles: files.length - images.length,
    };
  }

  async searchFolders(text: string): Promise<FolderHit[]> {
    const t = text.trim().toLocaleLowerCase('es');
    if (!t) return [];
    const root = path.resolve(this.root);
    if (!fs.existsSync(root)) return [];
    const hits: FolderHit[] = [];
    const walk = async (dir: string) => {
      for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
        if (!e.isDirectory() || e.name.startsWith('.')) continue;
        const abs = path.join(dir, e.name);
        if (e.name.toLocaleLowerCase('es').includes(t)) hits.push({ ...this.folderOf(abs), path: this.pathOf(abs) });
        await walk(abs);
      }
    };
    await walk(root);
    return hits.sort((a, b) => browseCompare(a.name, b.name)).slice(0, 30);
  }

  private async images(dirAbs: string): Promise<DriveImage[]> {
    const entries = await fsp.readdir(dirAbs, { withFileTypes: true });
    const out: DriveImage[] = [];
    for (const e of entries) {
      const mime = EXT_MIME[path.extname(e.name).toLowerCase()];
      if (!e.isFile() || !mime) continue;
      const abs = path.join(dirAbs, e.name);
      const buf = await fsp.readFile(abs);
      out.push({
        id: this.id(path.relative(this.root, abs)),
        name: e.name,
        mime,
        size: buf.length,
        md5: crypto.createHash('md5').update(buf).digest('hex'),
      });
    }
    return out.sort((a, b) => naturalCompare(a.name, b.name));
  }

  async scanFolder(folderId: string): Promise<FolderScan> {
    const abs = this.resolve(folderId);
    const looseImages = await this.images(abs);
    const subs = (await fsp.readdir(abs, { withFileTypes: true })).filter((e) => e.isDirectory() && !e.name.startsWith('.'));
    const chapters = [];
    for (const s of sortChapters(subs.map((d) => ({ rawName: d.name })))) {
      const subAbs = path.join(abs, s.rawName);
      chapters.push({
        driveFolderId: this.id(path.relative(this.root, subAbs)),
        name: s.name,
        sort: s.sort,
        images: await this.images(subAbs),
      });
    }
    const all = [...looseImages, ...chapters.flatMap((c) => c.images)];
    return {
      folder: { id: folderId, name: path.basename(abs) },
      looseImages,
      chapters: chapters.filter((c) => c.images.length),
      photoCount: all.length,
      totalBytes: all.reduce((s, i) => s + i.size, 0),
    };
  }

  async openOriginal(fileId: string): Promise<Readable> {
    return fs.createReadStream(this.resolve(fileId));
  }

  async thumbnail(fileId: string): Promise<Buffer | null> {
    return sharp(this.resolve(fileId)).rotate().resize(400, 400, { fit: 'inside' }).webp({ quality: 70 }).toBuffer();
  }
}
