'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import type { GalleryData, GPhoto } from '@/lib/gallery-types';
import { splitParts } from '@/lib/zipparts';
import { IconCheck, IconClose, IconDown, IconHeart } from '@/components/icons';
import { FLASH_FLAG } from './AccessView';
import { Viewer } from './Viewer';

/** Marks the history entry pushed while the viewer is open, so Back closes it. */
const VIEWER_STATE = 'mgViewer';
const LONG_PRESS_MS = 450;
const human = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : `${Math.max(0.1, b / 1024 ** 2).toFixed(0)} MB`);

function startDownload(href: string) {
  const a = document.createElement('a');
  a.href = href;
  a.rel = 'noopener';
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function GalleryView({ data }: { data: GalleryData }) {
  const t = useTranslations('gallery');
  const format = useFormatter();
  const [filter, setFilter] = useState<string>('all');
  const [favs, setFavs] = useState<Set<string>>(() => new Set(data.favourites));
  const [lb, setLb] = useState<number | null>(null);
  const [zip, setZip] = useState<null | 'all' | 'favs' | 'sel'>(null);
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const anchor = useRef<number | null>(null);
  const press = useRef<{ timer?: ReturnType<typeof setTimeout>; x: number; y: number; fired: boolean; touch: boolean }>({ x: 0, y: 0, fired: false, touch: false });
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const gridRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const [settle] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      return sessionStorage.getItem(FLASH_FLAG);
    } catch {
      return null;
    }
  });
  const canDownload = data.role === 'client';
  const chapterName = useCallback((id: string | null) => data.chapters.find((c) => c.id === id)?.name ?? '', [data.chapters]);

  const shown = useMemo(
    () =>
      data.photos.filter((p) => (filter === 'all' ? true : filter === 'favs' ? favs.has(p.id) : p.chapterId === filter)),
    [data.photos, filter, favs],
  );

  const say = (s: string) => {
    setToast(s);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 1800);
  };

  /* develop tiles as they scroll into view */
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target as HTMLElement;
          const d = Number(el.dataset.n ?? 0) % 6;
          setTimeout(() => el.classList.add('in'), d * 120);
          io.unobserve(el);
        }),
      { rootMargin: '0px 0px -5% 0px' },
    );
    grid.querySelectorAll('.tile:not(.in)').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [shown]);

  /* arriving through the camera flash: start overexposed, let the light fall away */
  useLayoutEffect(() => {
    try {
      sessionStorage.removeItem(FLASH_FLAG);
    } catch {}
    if (settle !== 'flash') return;
    const f = flashRef.current;
    const wash = f?.querySelector('.wash') as HTMLElement | null;
    const vh = window.innerHeight;
    let p = 0;
    gridRef.current?.querySelectorAll<HTMLElement>('.tile').forEach((tile) => {
      if (tile.getBoundingClientRect().top < vh) {
        tile.style.setProperty('--p', String(p++));
        tile.classList.add('in', 'pop');
      }
    });
    mainRef.current?.animate(
      [
        { filter: 'brightness(2.4) contrast(.7) grayscale(1)', transform: 'scale(1.04)' },
        { filter: 'brightness(1.3) contrast(.95) grayscale(.3)', offset: 0.45 },
        { filter: 'none', transform: 'none' },
      ],
      { duration: 1500, easing: 'cubic-bezier(.2,.6,.2,1)' },
    );
    const out = wash?.animate([{ opacity: 1 }, { opacity: 0.85, offset: 0.15 }, { opacity: 0 }], { duration: 1200, easing: 'ease-out', fill: 'forwards' });
    if (out) out.onfinish = () => f && (f.hidden = true);
    setTimeout(() => gridRef.current?.querySelectorAll('.tile.pop').forEach((el) => el.classList.remove('pop')), 3200);
  }, [settle]);

  const toggleFav = async (id: string) => {
    const on = !favs.has(id);
    setFavs((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
    say(on ? t('added') : t('removed'));
    const r = await fetch('/api/gallery/favourites', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ photoId: id, on }),
    }).catch(() => null);
    if (!r?.ok) {
      setFavs((s) => {
        const n = new Set(s);
        if (on) n.delete(id);
        else n.add(id);
        return n;
      });
    }
  };

  /** Heart or un-heart many photos in one go (the selection). */
  const favMany = async (ids: string[], on: boolean) => {
    if (!ids.length) return;
    const before = favs;
    setFavs((s) => {
      const n = new Set(s);
      ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
      return n;
    });
    say(on ? t('favSelDone', { count: ids.length }) : t('unfavSelDone', { count: ids.length }));
    const r = await fetch('/api/gallery/favourites', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ photoIds: ids, on }),
    }).catch(() => null);
    if (!r?.ok) {
      setFavs(before);
      say(t('saveFailed'));
    }
  };

  const downloadOne = (p: GPhoto) => {
    startDownload(`/api/gallery/photos/${p.id}/original`);
    say(t('singleStarted'));
  };

  /* viewer: opening it adds a history entry, so the phone's Back button closes it */
  const openAt = (n: number) => {
    try {
      if (!window.history.state?.[VIEWER_STATE]) window.history.pushState({ ...window.history.state, [VIEWER_STATE]: true }, '');
    } catch {}
    setLb(n);
  };
  const closeViewer = useCallback(() => {
    if (window.history.state?.[VIEWER_STATE]) window.history.back();
    else setLb(null);
  }, []);
  useEffect(() => {
    const onPop = () => {
      if (!window.history.state?.[VIEWER_STATE]) setLb(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    if (lb !== null && !shown[lb]) {
      if (shown.length) setLb(Math.min(lb, shown.length - 1));
      else closeViewer();
    }
  }, [lb, shown, closeViewer]);

  /* selection */
  const toggleSel = useCallback((id: string) => {
    setSelecting(true);
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);
  const pickTile = (n: number, range: boolean) => {
    const id = shown[n].id;
    if (range && anchor.current !== null && shown[anchor.current]) {
      const [a, b] = [Math.min(anchor.current, n), Math.max(anchor.current, n)];
      const on = !sel.has(id);
      setSel((s) => {
        const next = new Set(s);
        shown.slice(a, b + 1).forEach((p) => (on ? next.add(p.id) : next.delete(p.id)));
        return next;
      });
    } else toggleSel(id);
    anchor.current = n;
  };
  const exitSel = () => {
    setSelecting(false);
    setSel(new Set());
    anchor.current = null;
  };
  const picked = useMemo(() => data.photos.filter((p) => sel.has(p.id)), [data.photos, sel]);
  const pickedBytes = picked.reduce((s, p) => s + p.size, 0);
  const allShownPicked = shown.length > 0 && shown.every((p) => sel.has(p.id));
  const pickedAllFav = picked.length > 0 && picked.every((p) => favs.has(p.id));
  const selectShown = (on: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      shown.forEach((p) => (on ? n.add(p.id) : n.delete(p.id)));
      return n;
    });
  const canDownloadSel = canDownload && (picked.length === 1 || (picked.length > 1 && data.allowZip));
  const downloadSel = () => {
    if (picked.length === 1) downloadOne(picked[0]);
    else if (picked.length > 1) setZip('sel');
  };
  useEffect(() => {
    if (!selecting || lb !== null || zip) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitSel();
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectShown(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecting, lb, zip, shown]);

  /* a long press on a photo starts selecting (phones) */
  const pressStart = (e: React.PointerEvent, n: number) => {
    const pr = press.current;
    clearTimeout(pr.timer);
    pr.fired = false;
    pr.touch = e.pointerType !== 'mouse';
    if (!pr.touch) return;
    pr.x = e.clientX;
    pr.y = e.clientY;
    pr.timer = setTimeout(() => {
      pr.fired = true;
      navigator.vibrate?.(12);
      pickTile(n, false);
    }, LONG_PRESS_MS);
  };
  const pressMove = (e: React.PointerEvent) => {
    const pr = press.current;
    if (pr.timer && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > 10) clearTimeout(pr.timer);
  };
  const pressEnd = () => clearTimeout(press.current.timer);

  useEffect(() => {
    if (!zip) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setZip(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zip]);

  const zipSet = zip === 'favs' ? data.photos.filter((p) => favs.has(p.id)) : zip === 'sel' ? picked : data.photos;
  const parts = splitParts(zipSet.map((p) => ({ ...p, sizeBytes: p.size })));
  const longDate = (iso: string, utc = false) =>
    format.dateTime(new Date(iso), { day: 'numeric', month: 'long', year: 'numeric', ...(utc ? { timeZone: 'UTC' } : {}) });
  const event = data.eventLabel;
  const meta = data.eventDate
    ? data.place
      ? t('metaPlace', { event, place: data.place, date: longDate(data.eventDate, true) })
      : t('metaNoPlace', { event, date: longDate(data.eventDate, true) })
    : data.place
      ? `${event}, ${data.place}.`
      : '';

  const chips = [
    { id: 'all', label: t('all') },
    ...(data.chapters.length > 1 ? data.chapters.map((c) => ({ id: c.id, label: c.name })) : []),
    { id: 'favs', label: `${t('favs')} (${favs.size})` },
  ];

  return (
    <>
      <main ref={mainRef} className={`${settle ? '' : 'view-in'}${selecting ? ' selecting' : ''}`}>
        <header className="ghead gut">
          <div>
            <h1>{data.name}</h1>
            <div className="meta">
              {meta} {t('openUntil', { date: longDate(data.expiresAt) })}
            </div>
            {!canDownload && <div className="meta">{t('guestNote')}</div>}
          </div>
          {canDownload && (
            <div className="acts">
              {data.allowZip && (
                <>
                  <button className="pill" disabled={!favs.size} onClick={() => setZip('favs')}>
                    {t('downloadFavs', { count: favs.size })}
                  </button>
                  <button className="pill solid" onClick={() => setZip('all')}>
                    {t('downloadAll')}
                  </button>
                </>
              )}
            </div>
          )}
        </header>
        <div className="bar gut">
          <div className="chips" role="group">
            {chips.map((c) => (
              <button key={c.id} className="chip" aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="barend">
            <span className="small">
              {filter === 'all'
                ? t('showing', { count: shown.length })
                : t('inChapter', { count: shown.length, chapter: filter === 'favs' ? t('favs') : chapterName(filter) })}
            </span>
            <button className="chip selbtn" aria-pressed={selecting} onClick={() => (selecting ? exitSel() : setSelecting(true))}>
              {selecting ? t('selectDone') : t('select')}
            </button>
          </div>
        </div>
        <div className="grid gut" ref={gridRef}>
          {shown.map((p, n) => {
            const faved = favs.has(p.id);
            const on = sel.has(p.id);
            return (
              <figure
                key={p.id}
                // selection lives in a data attribute: the "in" class is added outside React
                className={`tile${settle && n < 12 ? ' in' : ''}`}
                data-n={n}
                data-sel={on || undefined}
                tabIndex={0}
                aria-selected={selecting ? on : undefined}
                onPointerDown={(e) => pressStart(e, n)}
                onPointerMove={pressMove}
                onPointerUp={pressEnd}
                onPointerCancel={pressEnd}
                onPointerLeave={pressEnd}
                onContextMenu={(e) => press.current.touch && e.preventDefault()}
                onClick={(e) => {
                  if (press.current.fired) {
                    press.current.fired = false;
                    return;
                  }
                  if (selecting) pickTile(n, e.shiftKey);
                  else openAt(n);
                }}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || (selecting && e.key === ' ')) {
                    e.preventDefault();
                    if (selecting) pickTile(n, e.shiftKey);
                    else openAt(n);
                  }
                }}
              >
                <img src={p.sm} width={p.w} height={p.h} alt={`${chapterName(p.chapterId)} ${p.name}`.trim()} loading={n < 12 ? 'eager' : 'lazy'} decoding="async" draggable={false} />
                <button
                  className="pick"
                  aria-label={t('selectPhoto', { name: p.name })}
                  aria-pressed={on}
                  tabIndex={selecting ? 0 : -1}
                  onClick={(e) => {
                    e.stopPropagation();
                    pickTile(n, e.shiftKey);
                  }}
                >
                  <IconCheck />
                </button>
                {faved && (
                  <svg className="heart" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="#f5f5f5" stroke="#0a0a0a" strokeWidth="1" />
                  </svg>
                )}
                <div className="ov">
                  <small>{p.name}</small>
                  <span className="btns">
                    <button
                      className={`ib${faved ? ' fav' : ''}`}
                      aria-label={t('favourite')}
                      aria-pressed={faved}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFav(p.id);
                      }}
                    >
                      <IconHeart />
                    </button>
                    {canDownload && (
                      <button
                        className="ib"
                        aria-label={t('downloadOriginal')}
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadOne(p);
                        }}
                      >
                        <IconDown />
                      </button>
                    )}
                  </span>
                </div>
              </figure>
            );
          })}
        </div>
        {!shown.length && <p className="empty gut">{t('empty')}</p>}
        <p className="small gut" style={{ paddingBottom: 40 }}>
          {t('note')}
        </p>
      </main>

      {selecting && (
        <div className="selbar" role="region" aria-label={t('selection')}>
          <button className="ib" aria-label={t('selectExit')} onClick={exitSel}>
            <IconClose />
          </button>
          <div className="selinfo" aria-live="polite">
            <strong>{t('selectedCount', { count: picked.length })}</strong>
            <small>{picked.length ? human(pickedBytes) : t('selectHint')}</small>
          </div>
          <div className="selacts">
            <button className="pill quiet" onClick={() => selectShown(!allShownPicked)} disabled={!shown.length}>
              {allShownPicked ? t('selectNone') : t('selectAll')}
            </button>
            <button
              className="pill tog heart"
              disabled={!picked.length}
              aria-pressed={pickedAllFav}
              aria-label={pickedAllFav ? t('removeFav') : t('addFav')}
              onClick={() => favMany(picked.map((p) => p.id), !pickedAllFav)}
            >
              <IconHeart />
              <span>{pickedAllFav ? t('removeFav') : t('addFav')}</span>
            </button>
            {canDownload && (data.allowZip || picked.length <= 1) && (
              <button className="pill solid" disabled={!canDownloadSel} onClick={downloadSel}>
                <IconDown />
                <span>{t('downloadSel', { count: picked.length })}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {lb !== null && shown[lb] && (
        <Viewer
          photos={shown}
          index={lb}
          onIndex={setLb}
          onClose={closeViewer}
          favs={favs}
          onFav={toggleFav}
          selected={sel}
          onSelect={toggleSel}
          canDownload={canDownload}
          onDownload={downloadOne}
          chapterName={chapterName}
        />
      )}

      {zip && (
        <div className="scrim" role="dialog" aria-modal="true" aria-label={zip === 'sel' ? t('zipSelTitle') : t('zipTitle')} onClick={(e) => e.target === e.currentTarget && setZip(null)}>
          <div className="sheet">
            <h3>{zip === 'sel' ? t('zipSelTitle') : t('zipTitle')}</h3>
            <div className="small">{t('zipSub', { count: zipSet.length, size: human(zipSet.reduce((s, p) => s + p.size, 0)) })}</div>
            <ul className="parts">
              {parts.map((part, i) => (
                <li key={i}>
                  <span>
                    {t('zipPart', { n: i + 1, total: parts.length })}
                    <small>{t('zipPartSize', { count: part.length, size: human(part.reduce((s, p) => s + p.size, 0)) })}</small>
                  </span>
                  {zip === 'sel' ? (
                    // a picked set can be long, so it goes as a form post; the answer is a download
                    <form method="post" action="/api/gallery/zip" onSubmit={() => say(t('started'))}>
                      <input type="hidden" name="ids" value={part.map((p) => p.id).join(',')} />
                      <input type="hidden" name="part" value={i + 1} />
                      <input type="hidden" name="parts" value={parts.length} />
                      <button className="pill solid" type="submit">
                        {t('download')}
                      </button>
                    </form>
                  ) : (
                    <a className="pill solid" href={`/api/gallery/zip?set=${zip}&part=${i + 1}`} download onClick={() => say(t('started'))}>
                      {t('download')}
                    </a>
                  )}
                </li>
              ))}
            </ul>
            <div className="acts">
              <button className="pill" onClick={() => setZip(null)} autoFocus>
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`toast${toast ? ' on' : ''}${selecting ? ' up' : ''}`} role="status">
        {toast}
      </div>
      {settle === 'flash' && (
        <div ref={flashRef} className="flash settle" aria-hidden="true">
          <div className="wash" />
        </div>
      )}
    </>
  );
}
