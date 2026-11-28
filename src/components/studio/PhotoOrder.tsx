'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { resetOrder, saveOrder } from '@/app/studio/actions';

export interface OrderItem {
  id: string;
  name: string;
  thumb: string;
  chapterId: string | null;
}

interface Props {
  albumId: string;
  photos: OrderItem[];
  chapters: { id: string; name: string }[];
  custom: boolean;
  toast: (s: string) => void;
}

type Groups = Record<string, string[]>;
const LOOSE = '_';
const LONG_PRESS_MS = 280;
const keyOf = (p: OrderItem) => p.chapterId ?? LOOSE;

function grouped(photos: OrderItem[]): Groups {
  const g: Groups = {};
  for (const p of photos) (g[keyOf(p)] ??= []).push(p.id);
  return g;
}

const move = (ids: string[], from: number, to: number) => {
  const next = [...ids];
  const [it] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, it);
  return next;
};

/**
 * Michael's photo order. Drag a photo to a new place (on a phone, press and
 * hold first), or tap one and use the arrows. Order changes only inside a
 * chapter. Saved order is what clients see by default.
 */
export function PhotoOrder({ albumId, photos, chapters, custom, toast }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const byId = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  const initial = useMemo(() => grouped(photos), [photos]);
  const [groups, setGroups] = useState<Groups>(initial);
  const tabs = useMemo(
    () => [
      ...(initial[LOOSE] ? [{ id: LOOSE, name: chapters.length ? 'Without chapter' : 'All photos' }] : []),
      ...chapters.filter((c) => initial[c.id]).map((c) => ({ id: c.id, name: c.name })),
    ],
    [initial, chapters],
  );
  const [tab, setTab] = useState(tabs[0]?.id ?? LOOSE);
  const [picked, setPicked] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [askReset, setAskReset] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    pointer: number;
    x: number;
    y: number;
    touch: boolean;
    active: boolean;
    timer?: ReturnType<typeof setTimeout>;
    raf?: number;
  } | null>(null);

  // new data from the server (after saving or a sync) replaces the local copy
  useEffect(() => {
    setGroups(initial);
    setPicked(null);
  }, [initial]);
  useEffect(() => {
    if (!tabs.some((t) => t.id === tab) && tabs[0]) setTab(tabs[0].id);
  }, [tabs, tab]);

  const ids = groups[tab] ?? [];
  const dirty = Object.keys(initial).some((k) => initial[k].join() !== (groups[k] ?? []).join());

  const moveId = (id: string, to: number) => {
    setGroups((g) => {
      const list = g[tab] ?? [];
      const from = list.indexOf(id);
      if (from < 0 || from === to) return g;
      return { ...g, [tab]: move(list, from, to) };
    });
  };

  /* ---- dragging ---- */
  const place = (x: number, y: number) => {
    const d = drag.current;
    if (!d?.active) return;
    const g = ghostRef.current;
    if (g) g.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-oid]');
    const target = hit?.dataset.oid;
    if (target && target !== d.id) {
      setGroups((g) => {
        const list = g[tab] ?? [];
        const from = list.indexOf(d.id);
        const to = list.indexOf(target);
        return from < 0 || to < 0 ? g : { ...g, [tab]: move(list, from, to) };
      });
    }
  };
  // scroll the page while a photo is held near the top or bottom edge
  const autoScroll = () => {
    const d = drag.current;
    if (!d?.active) return;
    const edge = 80;
    const h = window.innerHeight;
    const v = d.y < edge ? -(edge - d.y) / 4 : d.y > h - edge ? (d.y - (h - edge)) / 4 : 0;
    if (v) {
      window.scrollBy(0, v);
      place(d.x, d.y);
    }
    d.raf = requestAnimationFrame(autoScroll);
  };
  const begin = () => {
    const d = drag.current;
    if (!d) return;
    d.active = true;
    setDragId(d.id);
    setPicked(d.id);
    navigator.vibrate?.(10);
    requestAnimationFrame(() => requestAnimationFrame(() => drag.current && place(drag.current.x, drag.current.y)));
    d.raf = requestAnimationFrame(autoScroll);
  };
  const end = () => {
    const d = drag.current;
    if (!d) return;
    clearTimeout(d.timer);
    if (d.raf) cancelAnimationFrame(d.raf);
    drag.current = null;
    setDragId(null);
  };

  // while dragging on a phone, the finger moves the photo instead of the page
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const stop = (e: TouchEvent) => drag.current?.active && e.preventDefault();
    grid.addEventListener('touchmove', stop, { passive: false });
    return () => grid.removeEventListener('touchmove', stop);
  }, []);

  const onDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0 || pending) return;
    end();
    const touch = e.pointerType !== 'mouse';
    drag.current = { id, pointer: e.pointerId, x: e.clientX, y: e.clientY, touch, active: false };
    if (touch) drag.current.timer = setTimeout(begin, LONG_PRESS_MS);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointer) return;
    const far = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    d.x = e.clientX;
    d.y = e.clientY;
    if (!d.active) {
      if (d.touch && far > 8) end(); // a swipe: let the page scroll
      else if (!d.touch && far > 5) {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        begin();
      }
      return;
    }
    place(d.x, d.y);
  };
  const onUp = (id: string) => {
    const d = drag.current;
    if (d && !d.active) setPicked((p) => (p === id ? null : id)); // a tap picks the photo
    end();
  };

  /* ---- buttons and keys for the picked photo ---- */
  const at = picked ? ids.indexOf(picked) : -1;
  const nudge = (to: number) => picked && at >= 0 && moveId(picked, to);
  const onKey = (e: React.KeyboardEvent, id: string) => {
    const i = ids.indexOf(id);
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setPicked((p) => (p === id ? null : id));
    } else if (picked === id && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End')) {
      e.preventDefault();
      const to = e.key === 'ArrowLeft' ? i - 1 : e.key === 'ArrowRight' ? i + 1 : e.key === 'Home' ? 0 : ids.length - 1;
      moveId(id, to);
      requestAnimationFrame(() => gridRef.current?.querySelector<HTMLElement>(`[data-oid="${id}"]`)?.focus());
    } else if (e.key === 'Escape') setPicked(null);
  };

  const save = () =>
    start(async () => {
      const all = [...(groups[LOOSE] ?? []), ...chapters.flatMap((c) => groups[c.id] ?? [])];
      const r = await saveOrder(albumId, all);
      if (!r.ok) return toast(r.error);
      toast('Order saved. Clients see it next time they open the gallery');
      router.refresh();
    });
  const reset = () =>
    start(async () => {
      const r = await resetOrder(albumId);
      if (!r.ok) return toast(r.error);
      setAskReset(false);
      toast('Back to the Drive order');
      router.refresh();
    });

  if (!photos.length) return null;
  const pickedPhoto = picked ? byId.get(picked) : null;

  return (
    <div className="panel order">
      <div className="row">
        <h2>Photo order</h2>
        <span className="small">{custom ? 'Your order' : 'Drive order, by file name'}</span>
      </div>
      <p className="small" style={{ margin: '-4px 0 14px' }}>
        Drag photos to change the order clients see. On a phone, press and hold a photo, then drag. Or tap one and use the arrows.
      </p>
      {tabs.length > 1 && (
        <div className="seg" style={{ marginBottom: 14 }}>
          {tabs.map((t) => (
            <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => (setTab(t.id), setPicked(null))}>
              {t.name} <small>{groups[t.id]?.length ?? 0}</small>
            </button>
          ))}
        </div>
      )}
      <div className="otools" aria-live="polite">
        {pickedPhoto ? (
          <>
            <span className="small">
              <b>{pickedPhoto.name}</b>, {at + 1} of {ids.length}
            </span>
            <span className="acts">
              <button type="button" className="copy" disabled={at <= 0} onClick={() => nudge(0)}>
                To start
              </button>
              <button type="button" className="copy" aria-label="Move earlier" disabled={at <= 0} onClick={() => nudge(at - 1)}>
                ←
              </button>
              <button type="button" className="copy" aria-label="Move later" disabled={at >= ids.length - 1} onClick={() => nudge(at + 1)}>
                →
              </button>
              <button type="button" className="copy" disabled={at >= ids.length - 1} onClick={() => nudge(ids.length - 1)}>
                To end
              </button>
            </span>
          </>
        ) : (
          <span className="small">{ids.length} photos</span>
        )}
      </div>
      <div className={`ogrid${dragId ? ' dragging' : ''}`} ref={gridRef} role="listbox" aria-label="Photo order">
        {ids.map((id, n) => {
          const p = byId.get(id);
          if (!p) return null;
          return (
            <div
              key={id}
              data-oid={id}
              className="otile"
              role="option"
              tabIndex={0}
              aria-selected={picked === id}
              aria-label={`${n + 1}. ${p.name}`}
              data-drag={dragId === id || undefined}
              onPointerDown={(e) => onDown(e, id)}
              onPointerMove={onMove}
              onPointerUp={() => onUp(id)}
              onPointerCancel={end}
              onContextMenu={(e) => e.preventDefault()}
              onKeyDown={(e) => onKey(e, id)}
            >
              <img src={p.thumb} alt="" loading="lazy" draggable={false} />
              <i>{n + 1}</i>
            </div>
          );
        })}
      </div>
      {dragId && byId.get(dragId) && (
        <div className="oghost" ref={ghostRef} aria-hidden="true">
          <img src={byId.get(dragId)!.thumb} alt="" />
        </div>
      )}
      <div className={`savebar gut${dirty ? ' on' : ''}`}>
        <span>Photo order changed. Clients see it once you save.</span>
        <div className="acts">
          <button type="button" className="pill quiet" disabled={pending} onClick={() => (setGroups(initial), setPicked(null))}>
            Undo changes
          </button>
          <button type="button" className="pill solid" disabled={pending} onClick={save}>
            Save order
          </button>
        </div>
      </div>
      <div className="acts" style={{ marginTop: 14 }}>
        {custom && !dirty && (
          <button type="button" className="pill quiet" onClick={() => setAskReset(true)}>
            Back to Drive order
          </button>
        )}
      </div>
      {askReset && (
        <div className="confirm on">
          Puts every chapter back in file-name order, as in Drive. Your order is lost.
          <div className="acts">
            <button type="button" className="pill solid" disabled={pending} onClick={reset}>
              Use Drive order
            </button>
            <button type="button" className="pill quiet" onClick={() => setAskReset(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
