'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function StudioRail() {
  const path = usePathname();
  const albums = path === '/studio' || path.startsWith('/studio/albums');
  return (
    <nav className="rail" aria-label="Studio">
      <div className="grp">
        <Link className="ri" href="/studio" aria-label="Albums" aria-current={albums}>
          <svg viewBox="0 0 24 24" {...P} aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>
          <span className="tip" aria-hidden="true"><b>Albums</b><small>Every client gallery and its code</small></span>
        </Link>
        <Link className="ri" href="/studio/site" aria-label="Main page" aria-current={path === '/studio/site'}>
          <svg viewBox="0 0 24 24" {...P} aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M3.5 9h17M8 13h8M8 16h5" /></svg>
          <span className="tip" aria-hidden="true"><b>Main page</b><small>Hero, work, About, contact</small></span>
        </Link>
        <Link className="ri" href="/studio/categories" aria-label="Categories" aria-current={path === '/studio/categories'}>
          <svg viewBox="0 0 24 24" {...P} aria-hidden="true"><path d="M3.5 12.6V5a1.5 1.5 0 0 1 1.5-1.5h7.6a1.5 1.5 0 0 1 1.06.44l6.9 6.9a1.5 1.5 0 0 1 0 2.12l-7.6 7.6a1.5 1.5 0 0 1-2.12 0l-6.9-6.9a1.5 1.5 0 0 1-.44-1.06z" /><circle cx="8.5" cy="8.5" r="1.5" /></svg>
          <span className="tip" aria-hidden="true"><b>Categories</b><small>Kinds of shoots for albums</small></span>
        </Link>
      </div>
      <div className="grp">
        <Link className="ri add" href="/studio/new" aria-label="New album" aria-current={path === '/studio/new'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          <span className="tip" aria-hidden="true"><b>New album</b><small>From a Drive folder to a code</small></span>
        </Link>
      </div>
    </nav>
  );
}
