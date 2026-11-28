'use client';

import { useEffect, useRef, useState } from 'react';
import { browseFolder, searchFolders } from '@/app/studio/actions';
import { gb } from '@/lib/studio-format';

type Listing = Extract<Awaited<ReturnType<typeof browseFolder>>, { ok: true }>['listing'];
type Hit = Extract<Awaited<ReturnType<typeof searchFolders>>, { ok: true }>['hits'][number];

const LAST = 'studio.driveFolder';
const folderSvg = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
    <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" />
  </svg>
);
const chevron = (
  <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="m9 6 6 6-6 6" />
  </svg>
);

function remember(id: string) {
  try {
    localStorage.setItem(LAST, id);
  } catch {}
}
function recall(): string | undefined {
  try {
    return localStorage.getItem(LAST) ?? undefined;
  } catch {
    return undefined;
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Walks the photo library on Drive: breadcrumbs, subfolders, search, and a
 * "Use this folder" button for whichever folder is open.
 */
export function FolderBrowser({ selected, onPick }: { selected: string | null; onPick: (id: string, path: string[]) => void }) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);
  const searchSeq = useRef(0);

  const open = async (id?: string, fallback = false) => {
    const n = ++seq.current;
    setLoading(true);
    setError('');
    const r = await browseFolder(id);
    if (n !== seq.current) return;
    if (!r.ok) {
      // A remembered folder may have moved or been deleted: start at the top instead
      if (fallback && id) return open(undefined);
      setLoading(false);
      return setError(r.error);
    }
    setLoading(false);
    setListing(r.listing);
    remember(r.listing.folder.id);
  };

  useEffect(() => {
    open(recall(), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      searchSeq.current++;
      setHits(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const n = ++searchSeq.current;
      const r = await searchFolders(q);
      if (n !== searchSeq.current) return;
      setSearching(false);
      if (!r.ok) return setError(r.error);
      setHits(r.hits);
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const goTo = (id: string) => {
    setQuery('');
    setHits(null);
    open(id);
  };

  const here = listing?.folder;
  const empty = listing && !listing.imageCount && !listing.folders.length;
  const pathNames = (listing?.path ?? []).map((f) => f.name);

  return (
    <div className="browser">
      <input
        className="bsearch"
        type="search"
        placeholder="Search folders, e.g. San Jose"
        aria-label="Search folders"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {error && <p className="err">{error}</p>}

      {hits || searching ? (
        <div className="folders" aria-live="polite">
          {searching && !hits && <p className="loading">Searching Drive…</p>}
          {hits?.map((h) => (
            <button key={h.id} type="button" className="folder" onClick={() => goTo(h.id)}>
              {folderSvg}
              <span>
                <b>{h.name}</b>
                <small>{h.path.slice(0, -1).map((p) => p.name).join(' / ')}</small>
              </span>
              {selected === h.id ? <span className="tick on" /> : chevron}
            </button>
          ))}
          {hits && !hits.length && !searching && <p className="small">No folders with that name in your library.</p>}
        </div>
      ) : (
        <>
          <nav className="crumbs" aria-label="Folder path">
            {listing?.path.map((p, i) =>
              i === listing.path.length - 1 ? (
                <span key={p.id} aria-current="location">
                  {p.name}
                </span>
              ) : (
                <span key={p.id}>
                  <button type="button" onClick={() => open(p.id)}>
                    {p.name}
                  </button>
                  <i aria-hidden="true">/</i>
                </span>
              ),
            )}
          </nav>

          {listing && here && (
            <div className="here">
              <span className="small">
                {loading
                  ? 'Reading…'
                  : [
                      plural(listing.imageCount, 'photo here', 'photos here'),
                      plural(listing.folders.length, 'folder', 'folders'),
                      listing.imageBytes ? gb(listing.imageBytes) : '',
                      listing.otherFiles ? `${plural(listing.otherFiles, 'other file', 'other files')} (RAW, HEIC, video) skipped` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
              </span>
              <button
                type="button"
                className={selected === here.id ? 'pill solid' : 'pill'}
                disabled={loading || !!empty || listing.path.length === 1}
                onClick={() => onPick(here.id, pathNames)}
              >
                {selected === here.id ? 'Selected' : 'Use this folder'}
              </button>
            </div>
          )}

          {!listing && loading && <p className="loading">Reading Drive…</p>}

          <div className="folders" style={loading ? { opacity: 0.5 } : undefined}>
            {listing?.folders.map((f) => (
              <button key={f.id} type="button" className="folder" aria-current={selected === f.id || undefined} onClick={() => open(f.id)}>
                {folderSvg}
                <span>
                  <b>{f.name}</b>
                </span>
                {selected === f.id ? <span className="tick on" /> : chevron}
              </button>
            ))}
            {listing && empty && !loading && (
              <p className="small">
                {listing.otherFiles
                  ? 'Only files the site can’t show here (RAW, HEIC or video). Export JPEGs into this folder to use it.'
                  : 'This folder is empty.'}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
