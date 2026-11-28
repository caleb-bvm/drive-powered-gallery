'use server';

import { after } from 'next/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin, authMethods, passwordMatches, setAdmin, clearAdmin } from '@/lib/admin';
import { getDrive, type FolderHit, type FolderListing } from '@/lib/drive';
import {
  closeAlbum,
  codeOwner,
  createAlbum,
  deleteAlbum,
  extendAlbum,
  getAlbum,
  logEvent,
  processAlbum,
  setCode,
  syncAlbum,
  updateAlbumDetails,
  CodeError,
} from '@/lib/albums';
import { addCategory, CategoryError, deleteCategory, renameCategory, validCategory } from '@/lib/categories-db';
import type { Category } from '@/lib/categories';
import { checkCodeLocally, normalizeCode } from '@/lib/codes';
import { saveContent } from '@/lib/content';
import type { Img, SiteContent } from '@/lib/content-types';
import { getDb, schema } from '@/lib/db';
import { getStore, mediaKey } from '@/lib/storage';
import { randomId } from '@/lib/crypto';
import { makeSiteVariants } from '@/lib/images';
import { SITE_WIDTHS } from '@/lib/site-images';
import { env } from '@/lib/env';
import { clientIp } from '@/lib/request';
import { isBlocked, recordAttempt } from '@/lib/ratelimit';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (e: unknown): { ok: false; error: string } => {
  if (e instanceof CodeError || e instanceof CategoryError) return { ok: false, error: e.message };
  console.error('[studio]', e);
  return { ok: false, error: e instanceof Error ? e.message : 'Something went wrong.' };
};

/* ---- sign-in ----------------------------------------------------------- */

export async function passwordLogin(_: unknown, form: FormData): Promise<{ error: string } | undefined> {
  if (!authMethods().password) return { error: 'Password sign-in is off.' };
  // Same throttle as access codes, kept per IP: 5 wrong tries in 15 minutes
  const ip = await clientIp();
  const key = `studio:${ip}`;
  if (await isBlocked(key, key)) return { error: 'Too many tries. Wait 15 minutes and try again.' };
  await new Promise((r) => setTimeout(r, 400));
  const ok = passwordMatches(String(form.get('password') ?? ''));
  await recordAttempt(key, key, ok);
  if (!ok) return { error: 'Wrong password.' };
  await setAdmin(env.adminEmails[0] ?? 'admin', 'password');
  redirect('/studio');
}

export async function devLogin() {
  if (!authMethods().dev) return;
  await setAdmin('dev@localhost', 'dev');
  redirect('/studio');
}

export async function logout() {
  await clearAdmin();
  redirect('/studio/login');
}

/* ---- codes ------------------------------------------------------------- */

export async function checkCode(raw: string, albumId?: string) {
  await requireAdmin();
  const code = normalizeCode(raw);
  const local = checkCodeLocally(code);
  if (local.state === 'empty' || local.state === 'short') return local;
  const owner = await codeOwner(code);
  if (owner && owner.albumId !== albumId) return { state: 'taken' as const, owner: owner.albumName };
  if (owner && owner.albumId === albumId) return { state: 'same' as const };
  return local;
}

/* ---- Drive ------------------------------------------------------------- */

export async function browseFolder(id?: string): Promise<Result<{ listing: FolderListing }>> {
  try {
    await requireAdmin();
    return { ok: true, listing: await getDrive().listFolder(id) };
  } catch (e) {
    return fail(e);
  }
}

export async function searchFolders(text: string): Promise<Result<{ hits: FolderHit[] }>> {
  try {
    await requireAdmin();
    return { ok: true, hits: await getDrive().searchFolders(text.slice(0, 80)) };
  } catch (e) {
    return fail(e);
  }
}

export async function scanFolder(id: string): Promise<
  Result<{ name: string; photoCount: number; totalBytes: number; chapters: { name: string; count: number }[]; candidates: { id: string; name: string; chapter: string }[] }>
> {
  try {
    await requireAdmin();
    const s = await getDrive().scanFolder(id);
    const all = [
      ...s.looseImages.map((i) => ({ id: i.id, name: i.name, chapter: '' })),
      ...s.chapters.flatMap((c) => c.images.map((i) => ({ id: i.id, name: i.name, chapter: c.name }))),
    ];
    return {
      ok: true,
      name: s.folder.name,
      photoCount: s.photoCount,
      totalBytes: s.totalBytes,
      chapters: s.chapters.map((c) => ({ name: c.name, count: c.images.length })),
      // Every photo can be the cover; the picker pages through them
      candidates: all,
    };
  } catch (e) {
    return fail(e);
  }
}

/* ---- albums ------------------------------------------------------------ */

export interface PublishInput {
  name: string;
  eventType: string;
  eventDate: string;
  place: string;
  driveFolderId: string;
  coverDriveFileId: string | null;
  code: string;
  guestCode: string | null;
  days: number;
  allowZip: boolean;
  reminder: boolean;
  emailLang: string;
}

export async function publishAlbum(input: PublishInput): Promise<Result<{ id: string }>> {
  try {
    await requireAdmin();
    if (!input.name.trim()) return { ok: false, error: 'Write the names for the reveal.' };
    const days = [30, 60, 90, 180].includes(input.days) ? input.days : 90;
    const id = await createAlbum({
      name: input.name,
      eventType: await validCategory(input.eventType),
      eventDate: /^\d{4}-\d{2}-\d{2}$/.test(input.eventDate) ? input.eventDate : null,
      place: input.place,
      driveFolderId: input.driveFolderId,
      coverDriveFileId: input.coverDriveFileId,
      code: input.code,
      guestCode: input.guestCode || null,
      days,
      allowZip: input.allowZip,
      reminder: input.reminder,
      emailLang: input.emailLang === 'en' ? 'en' : 'es',
    });
    after(() => processAlbum(id));
    revalidatePath('/studio');
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function albumProgress(id: string) {
  await requireAdmin();
  const a = await getAlbum(id);
  if (!a) return null;
  return { status: a.status, processed: a.processedCount, total: a.photoCount, error: a.publishError };
}

export async function extend(id: string, days = 30): Promise<Result> {
  try {
    await requireAdmin();
    await extendAlbum(id, days);
    revalidatePath(`/studio/albums/${id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function close(id: string): Promise<Result> {
  try {
    await requireAdmin();
    await closeAlbum(id);
    revalidatePath(`/studio/albums/${id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function changeCode(id: string, role: 'client' | 'guest', code: string | null): Promise<Result> {
  try {
    await requireAdmin();
    if (role === 'client' && !code) return { ok: false, error: 'The client code cannot be empty.' };
    await setCode(id, role, code);
    await logEvent(id, 'code_changed', role === 'guest' ? (code ? 'Guest code set' : 'Guest code removed') : 'New client code; old sessions signed out');
    revalidatePath(`/studio/albums/${id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function sync(id: string): Promise<Result<{ added: number; removed: number; changed: number }>> {
  try {
    await requireAdmin();
    const r = await syncAlbum(id);
    after(() => processAlbum(id));
    revalidatePath(`/studio/albums/${id}`);
    return { ok: true, ...r };
  } catch (e) {
    return fail(e);
  }
}

export async function retryProcessing(id: string): Promise<Result> {
  await requireAdmin();
  after(() => processAlbum(id));
  return { ok: true };
}

export async function saveDetails(
  id: string,
  d: { name: string; eventType: string; eventDate: string; place: string; coverPhotoId: string | null; allowZip: boolean; emailLang: string },
): Promise<Result> {
  try {
    await requireAdmin();
    if (!d.name.trim()) return { ok: false, error: 'Names cannot be empty.' };
    await updateAlbumDetails(id, {
      name: d.name,
      eventType: await validCategory(d.eventType),
      eventDate: /^\d{4}-\d{2}-\d{2}$/.test(d.eventDate) ? d.eventDate : null,
      place: d.place,
      coverPhotoId: d.coverPhotoId,
      allowZip: d.allowZip,
      emailLang: d.emailLang === 'en' ? 'en' : 'es',
    });
    revalidatePath(`/studio/albums/${id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeAlbum(id: string): Promise<Result> {
  try {
    await requireAdmin();
    await deleteAlbum(id);
    revalidatePath('/studio');
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ---- categories -------------------------------------------------------- */

const revalidateCategories = () => {
  revalidatePath('/studio', 'layout');
  revalidatePath('/', 'layout');
};

export async function createCategory(es: string, en: string): Promise<Result<{ category: Category }>> {
  try {
    await requireAdmin();
    const category = await addCategory(es, en);
    revalidateCategories();
    return { ok: true, category };
  } catch (e) {
    return fail(e);
  }
}

export async function updateCategory(id: string, es: string, en: string): Promise<Result> {
  try {
    await requireAdmin();
    await renameCategory(id, es, en);
    revalidateCategories();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeCategory(id: string): Promise<Result> {
  try {
    await requireAdmin();
    await deleteCategory(id);
    revalidateCategories();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ---- main page --------------------------------------------------------- */

export async function saveSite(content: SiteContent): Promise<Result> {
  try {
    await requireAdmin();
    if (!content?.hero?.slides?.length) return { ok: false, error: 'Keep at least one slide.' };
    await saveContent(content);
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Upload an image for the public site: encoded at every web size (AVIF + WebP), metadata stripped. */
export async function uploadImage(form: FormData): Promise<Result<{ img: Img }>> {
  try {
    await requireAdmin();
    const file = form.get('file');
    if (!(file instanceof File) || !file.size) return { ok: false, error: 'Choose an image.' };
    if (file.size > 60 * 1024 ** 2) return { ok: false, error: 'That file is over 60 MB.' };
    const buf = Buffer.from(await file.arrayBuffer());
    const v = await makeSiteVariants(buf, SITE_WIDTHS);
    const id = randomId(9);
    const store = getStore();
    for (const f of v.files) {
      await store.put(mediaKey(id, f.width, 'avif'), f.avif, 'image/avif');
      await store.put(mediaKey(id, f.width, 'webp'), f.webp, 'image/webp');
    }
    // Fixed names for the Studio thumbnails and anything that still asks for lg / sm.
    const largest = v.files[v.files.length - 1];
    const small = v.files[0];
    await store.put(mediaKey(id, 'lg'), largest.webp, 'image/webp');
    await store.put(mediaKey(id, 'sm'), small.webp, 'image/webp');
    const db = await getDb();
    await db.insert(schema.media).values({ id, width: v.width, height: v.height });
    return { ok: true, img: { src: `/api/media/${id}/lg`, w: v.width, h: v.height, blur: v.blur } };
  } catch (e) {
    return fail(e);
  }
}
