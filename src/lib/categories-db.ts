import 'server-only';
import { asc, eq, sql } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { BUILTIN_CATEGORIES, BUILTIN_IDS, OTHER, slugify, type Category } from '@/lib/categories';

export async function customCategories(): Promise<Category[]> {
  const db = await getDb();
  const rows = await db.select().from(schema.categories).orderBy(asc(schema.categories.createdAt));
  return rows.map((r) => ({ id: r.id, es: r.es, en: r.en, group: 'custom' as const }));
}

/** Built-in categories plus the ones added in the Studio. */
export async function allCategories(): Promise<Category[]> {
  return [...BUILTIN_CATEGORIES, ...(await customCategories())];
}

/** The id if it names a known category, otherwise "other". */
export async function validCategory(id: string): Promise<string> {
  if (BUILTIN_IDS.has(id)) return id;
  const db = await getDb();
  const [row] = await db.select({ id: schema.categories.id }).from(schema.categories).where(eq(schema.categories.id, id));
  return row ? id : OTHER.id;
}

/** How many albums use each category. */
export async function categoryUsage(): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db
    .select({ id: schema.albums.eventType, n: sql<number>`count(*)::int` })
    .from(schema.albums)
    .groupBy(schema.albums.eventType);
  return Object.fromEntries(rows.map((r) => [r.id, Number(r.n)]));
}

export class CategoryError extends Error {}

const clean = (s: string, max = 40) => s.replace(/\s+/g, ' ').trim().slice(0, max);

async function sameLabel(es: string, except?: string) {
  const key = es.toLocaleLowerCase('es');
  const all = await allCategories();
  return all.find((x) => x.id !== except && x.es.toLocaleLowerCase('es') === key);
}

export async function addCategory(esRaw: string, enRaw: string): Promise<Category> {
  const es = clean(esRaw);
  const en = clean(enRaw);
  if (!es) throw new CategoryError('Write the Spanish name.');
  const dupe = await sameLabel(es);
  if (dupe) throw new CategoryError(`"${dupe.es}" is already a category.`);
  const base = slugify(es) || 'categoria';
  const db = await getDb();
  const taken = new Set([...BUILTIN_IDS, ...(await customCategories()).map((x) => x.id)]);
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  await db.insert(schema.categories).values({ id, es, en });
  return { id, es, en, group: 'custom' };
}

export async function renameCategory(id: string, esRaw: string, enRaw: string) {
  const es = clean(esRaw);
  const en = clean(enRaw);
  if (!es) throw new CategoryError('Write the Spanish name.');
  const dupe = await sameLabel(es, id);
  if (dupe) throw new CategoryError(`"${dupe.es}" is already a category.`);
  const db = await getDb();
  const res = await db.update(schema.categories).set({ es, en }).where(eq(schema.categories.id, id)).returning({ id: schema.categories.id });
  if (!res.length) throw new CategoryError('Only categories you added can be renamed.');
}

export async function deleteCategory(id: string) {
  const used = (await categoryUsage())[id] ?? 0;
  if (used) throw new CategoryError(`${used} album${used === 1 ? ' uses' : 's use'} this category. Move ${used === 1 ? 'it' : 'them'} to another one first.`);
  const db = await getDb();
  await db.delete(schema.categories).where(eq(schema.categories.id, id));
}
