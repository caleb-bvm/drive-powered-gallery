'use client';

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { useTranslations } from 'next-intl';
import type { GPhoto } from '@/lib/gallery-types';
import { IconCheck, IconClose, IconDown, IconHeart, IconLeft, IconMinus, IconPlus, IconRight } from '@/components/icons';

export const MAX_ZOOM = 4;
const TAP_ZOOM = 2.5;
const STEP_ZOOM = 1.6;

const mb = (b: number) => (b / 1024 ** 2).toFixed(1);

/* ---- zoomable stage ------------------------------------------------------ */

export interface ZoomApi {
  zoomBy(factor: number): void;
  reset(): void;
}

interface Layout {
  W: number;
  H: number;
  /** The photo's box at 1x: always the whole photo, never cropped. */
  ox: number;
  oy: number;
  iw: number;
  ih: number;
}

type Gesture =
  | { mode: 'idle' }
  | { mode: 'pending' | 'pan' | 'swipe-x' | 'swipe-y'; id: number; sx: number; sy: number; s: number; x: number; y: number; t0: number; touch: boolean; dx: number; dy: number }
  | { mode: 'pinch'; d0: number; mx: number; my: number; s: number; x: number; y: number };

/**
 * One photo, fitted whole inside the stage (contain), with zoom and pan:
 * pinch, double-tap, click, the mouse wheel and the +/- buttons. At 1x a
 * sideways swipe changes photo and a downward swipe closes the viewer.
 */
function ZoomStage({
  photo,
  apiRef,
  onScale,
  onSwipe,
  onDismiss,
  children,
}: {
  photo: GPhoto;
  apiRef: Ref<ZoomApi>;
  onScale: (s: number) => void;
  onSwipe: (dir: 1 | -1) => void;
  onDismiss: () => void;
  children?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const full = useRef<HTMLImageElement>(null);
  const v = useRef({ s: 1, x: 0, y: 0 });
  const lay = useRef<Layout | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [held, setHeld] = useState(false);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef<Gesture>({ mode: 'idle' });
  const lastTap = useRef({ t: 0, x: 0, y: 0 });
  const shown = useRef(100);

  const measure = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const pl = parseFloat(cs.paddingLeft) || 0;
    const pr = parseFloat(cs.paddingRight) || 0;
    const pt = parseFloat(cs.paddingTop) || 0;
    const pb = parseFloat(cs.paddingBottom) || 0;
    const W = el.clientWidth;
    const H = el.clientHeight;
    const aw = Math.max(1, W - pl - pr);
    const ah = Math.max(1, H - pt - pb);
    const k = Math.min(aw / photo.w, ah / photo.h);
    const iw = photo.w * k;
    const ih = photo.h * k;
    const next = { W, H, iw, ih, ox: pl + (aw - iw) / 2, oy: pt + (ah - ih) / 2 };
    lay.current = next;
    setLayout(next);
  }, [photo.w, photo.h]);

  /** Keep the photo covering the view when zoomed, centred when it fits. */
  const clamp = (s: number, x: number, y: number) => {
    const l = lay.current;
    if (!l) return { s, x, y };
    const axis = (t: number, o: number, size: number, view: number) => {
      const len = size * s;
      // fits: keep its centre where the 1x layout put it
      if (len <= view) return (o + size / 2) * (1 - s);
      return Math.min(-o * s, Math.max(view - (o + size) * s, t));
    };
    return { s, x: axis(x, l.ox, l.iw, l.W), y: axis(y, l.oy, l.ih, l.H) };
  };

  const paint = (anim: boolean, extra = '') => {
    const p = pane.current;
    if (!p) return;
    const { s, x, y } = v.current;
    p.style.transition = anim ? 'transform .28s cubic-bezier(.2,.7,.2,1), opacity .28s' : 'none';
    p.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})${extra}`;
    setZoomed(s > 1.01);
    const pct = Math.round(s * 100);
    if (pct !== shown.current) {
      shown.current = pct;
      onScale(pct / 100);
    }
  };

  const set = (s: number, x: number, y: number, anim: boolean) => {
    v.current = clamp(s, x, y);
    paint(anim);
  };

  /** Zoom to `s`, keeping the point (px, py) of the stage still. */
  const zoomTo = (s: number, px: number, py: number, anim: boolean) => {
    const cur = v.current;
    const ns = Math.min(MAX_ZOOM, Math.max(1, s));
    set(ns, px - ((px - cur.x) * ns) / cur.s, py - ((py - cur.y) * ns) / cur.s, anim);
  };

  useImperativeHandle(apiRef, () => ({
    zoomBy(f) {
      const l = lay.current;
      if (l) zoomTo(v.current.s * f, l.W / 2, l.H / 2, true);
    },
    reset() {
      set(1, 0, 0, true);
    },
  }));

  useLayoutEffect(() => {
    measure();
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      measure();
      const { s, x, y } = v.current;
      v.current = clamp(s, x, y);
      paint(false);
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure]);

  useEffect(() => {
    if (full.current?.complete && full.current.naturalWidth) setLoaded(true);
  }, []);

  /* the wheel zooms around the cursor; needs a non-passive listener */
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const f = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.002));
      zoomTo(v.current.s * f, e.clientX - r.left, e.clientY - r.top, false);
      if (v.current.s <= 1.01) set(1, 0, 0, false);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const startPinch = () => {
    const [a, b] = [...pts.current.values()];
    g.current = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, ...v.current };
  };

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest('button')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    box.current!.setPointerCapture(e.pointerId);
    const p = local(e);
    pts.current.set(e.pointerId, p);
    setHeld(true);
    if (pts.current.size === 1) {
      g.current = { mode: 'pending', id: e.pointerId, sx: p.x, sy: p.y, t0: performance.now(), touch: e.pointerType !== 'mouse', dx: 0, dy: 0, ...v.current };
    } else if (pts.current.size === 2) {
      startPinch();
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    const p = local(e);
    pts.current.set(e.pointerId, p);
    const st = g.current;
    if (st.mode === 'pinch') {
      if (pts.current.size < 2) return;
      const [a, b] = [...pts.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const ns = Math.min(MAX_ZOOM, Math.max(1, (st.s * d) / st.d0));
      set(ns, mx - ((st.mx - st.x) * ns) / st.s, my - ((st.my - st.y) * ns) / st.s, false);
      return;
    }
    if (st.mode === 'idle' || e.pointerId !== st.id) return;
    st.dx = p.x - st.sx;
    st.dy = p.y - st.sy;
    if (st.mode === 'pending') {
      if (Math.hypot(st.dx, st.dy) < 8) return;
      if (st.s > 1.01) st.mode = 'pan';
      else if (Math.abs(st.dx) >= Math.abs(st.dy)) st.mode = 'swipe-x';
      else if (st.touch && st.dy > 0) st.mode = 'swipe-y';
      else st.mode = 'pan';
    }
    if (st.mode === 'pan') set(st.s, st.x + st.dx, st.y + st.dy, false);
    else if (st.mode === 'swipe-x') {
      pane.current!.style.transition = 'none';
      pane.current!.style.transform = `translate3d(${st.dx}px, 0, 0)`;
    } else if (st.mode === 'swipe-y') {
      const dy = Math.max(0, st.dy);
      pane.current!.style.transition = 'none';
      pane.current!.style.transform = `translate3d(0, ${dy}px, 0) scale(${1 - Math.min(dy / 2000, 0.15)})`;
      pane.current!.style.opacity = String(1 - Math.min(dy / 500, 0.6));
    }
  };

  const onUp = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.delete(e.pointerId);
    const st = g.current;
    if (st.mode === 'pinch') {
      if (pts.current.size === 1) {
        // carry on panning with the finger that stayed
        const [[id, p]] = [...pts.current.entries()];
        g.current = { mode: 'pan', id, sx: p.x, sy: p.y, t0: 0, touch: true, dx: 0, dy: 0, ...v.current };
      } else if (!pts.current.size) {
        g.current = { mode: 'idle' };
        if (v.current.s <= 1.05) set(1, 0, 0, true);
      }
      if (!pts.current.size) setHeld(false);
      return;
    }
    if (pts.current.size) return;
    setHeld(false);
    g.current = { mode: 'idle' };
    if (st.mode === 'idle' || e.pointerId !== st.id) return;
    const p = local(e);
    const quick = performance.now() - st.t0;
    if (st.mode === 'swipe-x') {
      const fast = Math.abs(st.dx) / Math.max(quick, 1) > 0.5;
      if (Math.abs(st.dx) > 70 || (fast && Math.abs(st.dx) > 30)) {
        set(1, 0, 0, false);
        onSwipe(st.dx < 0 ? 1 : -1);
        return;
      }
      set(1, 0, 0, true);
    } else if (st.mode === 'swipe-y') {
      if (st.dy > 120) {
        onDismiss();
        return;
      }
      pane.current!.style.opacity = '1';
      set(1, 0, 0, true);
    } else if (st.mode === 'pending' && e.type === 'pointerup' && quick < 400) {
      // a tap: mouse clicks toggle zoom, fingers double-tap
      const toggle = () => (v.current.s > 1.01 ? set(1, 0, 0, true) : zoomTo(TAP_ZOOM, p.x, p.y, true));
      if (!st.touch) toggle();
      else {
        const last = lastTap.current;
        const now = performance.now();
        if (now - last.t < 320 && Math.hypot(p.x - last.x, p.y - last.y) < 40) {
          lastTap.current = { t: 0, x: 0, y: 0 };
          toggle();
        } else lastTap.current = { t: now, x: p.x, y: p.y };
      }
    }
  };

  const pos = layout ? { left: layout.ox, top: layout.oy, width: layout.iw, height: layout.ih } : { visibility: 'hidden' as const };
  return (
    <div
      ref={box}
      className={`stage${zoomed ? ' zoomed' : ''}${held ? ' held' : ''}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onDragStart={(e) => e.preventDefault()}
    >
      <div className="pane" ref={pane}>
        <img className="ph" src={photo.sm} alt="" aria-hidden="true" draggable={false} style={pos} />
        <img
          ref={full}
          className={`full${loaded ? ' on' : ''}`}
          src={photo.lg}
          alt={photo.name}
          draggable={false}
          decoding="async"
          onLoad={() => setLoaded(true)}
          style={pos}
        />
      </div>
      {children}
    </div>
  );
}

/* ---- the viewer ---------------------------------------------------------- */

export function Viewer({
  photos,
  index,
  onIndex,
  onClose,
  favs,
  onFav,
  selected,
  onSelect,
  canDownload,
  onDownload,
  chapterName,
}: {
  photos: GPhoto[];
  index: number;
  onIndex: (n: number) => void;
  onClose: () => void;
  favs: Set<string>;
  onFav: (id: string) => void;
  selected: Set<string>;
  onSelect: (id: string) => void;
  canDownload: boolean;
  onDownload: (p: GPhoto) => void;
  chapterName: (id: string | null) => string;
}) {
  const t = useTranslations('gallery');
  const api = useRef<ZoomApi>(null);
  const [scale, setScale] = useState(1);
  const cur = photos[index];
  const total = photos.length;
  const step = useCallback((d: number) => total && onIndex((index + d + total) % total), [index, total, onIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === 'ArrowLeft') step(-1);
      else if (k === 'ArrowRight') step(1);
      else if (k === 'Home') onIndex(0);
      else if (k === 'End') onIndex(total - 1);
      else if (k === 'Escape') onClose();
      else if (k === '+' || k === '=') api.current?.zoomBy(STEP_ZOOM);
      else if (k === '-' || k === '_') api.current?.zoomBy(1 / STEP_ZOOM);
      else if (k === '0') api.current?.reset();
      else if (k.toLowerCase() === 'f' && cur) onFav(cur.id);
      else if (k.toLowerCase() === 's' && cur) onSelect(cur.id);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, onClose, onFav, onSelect, onIndex, cur, total]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // preload the neighbours
  useEffect(() => {
    [1, -1].forEach((d) => {
      const n = photos[(index + d + total) % total];
      if (n) new Image().src = n.lg;
    });
  }, [index, photos, total]);

  if (!cur) return null;
  const faved = favs.has(cur.id);
  const picked = selected.has(cur.id);
  const chapter = chapterName(cur.chapterId);

  return (
    <div className="lb" role="dialog" aria-modal="true" aria-label={t('viewer')} aria-describedby="lb-keys">
      <p id="lb-keys" className="sr">
        {t('keys')}
      </p>
      <div className="lbtop gut">
        <div className="lbl">
          <button className="pill lbclose" onClick={onClose} autoFocus>
            <IconClose />
            <span>{t('close')}</span>
          </button>
          <span className="count" aria-live="polite">
            {t('of', { n: index + 1, total })}
          </span>
        </div>
        <div className="zoomctl" role="group" aria-label={t('zoom')}>
          <button className="ib" aria-label={t('zoomOut')} disabled={scale <= 1.01} onClick={() => api.current?.zoomBy(1 / STEP_ZOOM)}>
            <IconMinus />
          </button>
          <button className="pct" onClick={() => api.current?.reset()} disabled={scale <= 1.01} aria-label={t('zoomFit')}>
            {Math.round(scale * 100)}%
          </button>
          <button className="ib" aria-label={t('zoomIn')} disabled={scale >= MAX_ZOOM - 0.01} onClick={() => api.current?.zoomBy(STEP_ZOOM)}>
            <IconPlus />
          </button>
        </div>
      </div>
      <ZoomStage key={cur.id} photo={cur} apiRef={api} onScale={setScale} onSwipe={step} onDismiss={onClose}>
        {total > 1 && (
          <>
            <button className="arrow l" aria-label={t('prev')} onClick={() => step(-1)}>
              <IconLeft />
            </button>
            <button className="arrow r" aria-label={t('next')} onClick={() => step(1)}>
              <IconRight />
            </button>
          </>
        )}
      </ZoomStage>
      <div className="lbbot gut">
        <span className="small">
          {chapter ? t('photoMeta', { name: cur.name, chapter, mb: mb(cur.size) }) : t('photoMetaNoChapter', { name: cur.name, mb: mb(cur.size) })}
        </span>
        <div className="acts">
          <button className="pill tog" onClick={() => onSelect(cur.id)} aria-pressed={picked} aria-label={picked ? t('selected') : t('select')}>
            <IconCheck />
            <span>{picked ? t('selected') : t('select')}</span>
          </button>
          <button className="pill tog heart" onClick={() => onFav(cur.id)} aria-pressed={faved} aria-label={faved ? t('removeFav') : t('addFav')}>
            <IconHeart />
            <span>{faved ? t('removeFav') : t('addFav')}</span>
          </button>
          {canDownload && (
            <button className="pill solid" onClick={() => onDownload(cur)}>
              <IconDown />
              <span>{t('downloadOriginal')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
