'use client';

import { useEffect, useState } from 'react';
import type { Img } from '@/lib/content-types';
import { focusPosition } from '@/lib/site-images';
import { SiteImage } from './SiteImage';

interface Slide {
  img: Img;
  caption: string;
}

/*
 * The hero is never taller than a 3:2 frame (see .hero in site.css), so on a
 * phone it is at least 560 px tall and the photo is drawn 840 px wide; on
 * wider screens it spans the viewport.
 */
const SIZES = '(max-width: 840px) 840px, 100vw';

export function Hero({ slides, title, line, label }: { slides: Slide[]; title: string; line: string; label: string }) {
  const [i, setI] = useState(0);
  // Only the first slide loads with the page; each next one loads while the current one shows.
  const [mounted, setMounted] = useState(1);

  const mountNext = (n: number) => setMounted((m) => Math.max(m, Math.min(slides.length, n + 2)));

  useEffect(() => {
    if (i > 0) mountNext(i);
  }, [i]);

  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') setI((n) => (n + 1) % slides.length);
    }, 6000);
    return () => clearInterval(id);
  }, [slides.length]);

  return (
    <section className="hero" aria-label={label}>
      {slides.map((s, n) => (
        <div
          key={s.img.src + n}
          className={`slide${n === i ? ' on' : ''}`}
          aria-hidden={n !== i}
          style={{ transformOrigin: focusPosition(s.img.focus) }}
        >
          {n < mounted && (
            <SiteImage
              img={s.img}
              alt={s.caption}
              sizes={SIZES}
              preload={n === 0}
              fetchPriority={n === 0 ? 'high' : 'low'}
              loading={n === 0 ? undefined : 'eager'}
              quality={82}
              onLoad={() => n === i && mountNext(n)}
            />
          )}
        </div>
      ))}
      <div className="herotext gut">
        <div>
          <h1>{title}</h1>
          {line && <p>{line}</p>}
        </div>
        <div className="cap" aria-live="off">
          {slides[i]?.caption}
        </div>
      </div>
    </section>
  );
}
