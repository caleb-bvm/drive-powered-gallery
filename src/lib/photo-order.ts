/*
 * Photo order. Photos are shown loose ones first, then chapter by chapter
 * (in folder order). Inside each of those groups the order is either the
 * Drive order (by file name) or one Michael set by hand in the Studio.
 */

export interface OrderPhoto {
  id: string;
  chapterId: string | null;
  sort: number;
}

/** Group keys in display order: loose photos (null) first, then the chapters. */
export function groupKeys(chapterOrder: string[]): (string | null)[] {
  return [null, ...chapterOrder];
}

/**
 * Michael's order from the Studio: `ids` lists photos in the order he wants.
 * Photos keep their chapter; only the order inside each chapter changes. Any
 * photo missing from `ids` (still being prepared, say) stays after the listed
 * ones, in its old order. Unknown ids are ignored.
 * Returns photo id -> new sort, numbered across the whole album.
 */
export function manualOrder(photos: OrderPhoto[], ids: string[], chapterOrder: string[]): Map<string, number> {
  const byId = new Map(photos.map((p) => [p.id, p]));
  const rank = new Map<string, number>();
  ids.forEach((id, i) => byId.has(id) && !rank.has(id) && rank.set(id, i));
  const key = (p: OrderPhoto) => (p.chapterId !== null && chapterOrder.includes(p.chapterId) ? p.chapterId : null);
  const out = new Map<string, number>();
  let n = 0;
  for (const g of groupKeys(chapterOrder)) {
    photos
      .filter((p) => key(p) === g)
      .sort((a, b) => {
        const ra = rank.get(a.id);
        const rb = rank.get(b.id);
        if (ra !== undefined && rb !== undefined) return ra - rb;
        if (ra !== undefined) return -1;
        if (rb !== undefined) return 1;
        return a.sort - b.sort;
      })
      .forEach((p) => out.set(p.id, n++));
  }
  return out;
}

/**
 * Order after a Drive sync. `fresh` is the album as Drive has it now, already
 * in Drive order. Without a hand-set order that is the order. With one, the
 * photos that were already in a chapter keep their places and new arrivals go
 * at the end of their chapter, in Drive order.
 * Returns Drive file id -> sort.
 */
export function syncedOrder(
  fresh: { driveFileId: string; chapterId: string | null }[],
  existing: Map<string, { sort: number; chapterId: string | null }>,
  custom: boolean,
): Map<string, number> {
  const out = new Map<string, number>();
  if (!custom) {
    fresh.forEach((f, i) => out.set(f.driveFileId, i));
    return out;
  }
  const groups: (string | null)[] = [];
  for (const f of fresh) if (!groups.includes(f.chapterId)) groups.push(f.chapterId);
  let n = 0;
  for (const g of groups) {
    const items = fresh.map((f, i) => ({ f, i })).filter(({ f }) => f.chapterId === g);
    const kept = items.filter(({ f }) => existing.get(f.driveFileId)?.chapterId === g);
    const arrived = items.filter(({ f }) => existing.get(f.driveFileId)?.chapterId !== g);
    kept.sort((a, b) => existing.get(a.f.driveFileId)!.sort - existing.get(b.f.driveFileId)!.sort);
    [...kept, ...arrived].forEach(({ f }) => out.set(f.driveFileId, n++));
  }
  return out;
}

export type ClientSort = 'album' | 'taken' | 'name';

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

/** The client's own view order. `album` is Michael's order, as given. */
export function sortForClient<T extends { name: string; takenAt: string | null }>(photos: T[], by: ClientSort): T[] {
  if (by === 'album') return photos;
  const list = photos.map((p, i) => ({ p, i }));
  if (by === 'name') return list.sort((a, b) => collator.compare(a.p.name, b.p.name) || a.i - b.i).map((x) => x.p);
  // date taken, oldest first; photos without a date go last, in album order
  return list
    .sort((a, b) => {
      const ta = a.p.takenAt;
      const tb = b.p.takenAt;
      if (ta && tb) return ta < tb ? -1 : ta > tb ? 1 : a.i - b.i;
      if (ta) return -1;
      if (tb) return 1;
      return a.i - b.i;
    })
    .map((x) => x.p);
}
