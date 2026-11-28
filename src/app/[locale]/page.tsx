import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getContent } from '@/lib/content';
import { pick } from '@/lib/content-types';
import { Hero } from '@/components/site/Hero';
import { SiteImage } from '@/components/site/SiteImage';
import { coverScale } from '@/lib/site-images';
import type { Img } from '@/lib/content-types';
import { Develop } from '@/components/site/Develop';
import { IconCamera } from '@/components/icons';

/* Frame shape and share of the 12-column spread for .p1 to .p7 (site.css). */
const PIECES = [
  { ratio: 3 / 2, cols: 7 },
  { ratio: 4 / 5, cols: 4 },
  { ratio: 4 / 5, cols: 4 },
  { ratio: 3 / 2, cols: 7 },
  { ratio: 16 / 9, cols: 6 },
  { ratio: 4 / 3, cols: 6 },
  { ratio: 4 / 3, cols: 6 },
];

/** A 3:2 photo in a 4:5 frame is drawn wider than the frame; ask for a file that covers it. */
function pieceSizes(img: Img, i: number) {
  const { ratio, cols } = PIECES[i % PIECES.length];
  const k = coverScale(img, ratio);
  return `(max-width: 860px) ${Math.round(100 * k)}vw, ${Math.round((100 * cols * k) / 12)}vw`;
}

function portraitSizes(img: Img) {
  const k = coverScale(img, 4 / 5);
  return `(max-width: 860px) ${Math.round(420 * k)}px, ${Math.round(42 * k)}vw`;
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');
  const c = await getContent();
  const p = (b: Parameters<typeof pick>[0]) => pick(b, locale);
  const phoneDigits = c.contact.phone.replace(/[^\d]/g, '');
  const ig = c.contact.instagram.replace(/^@/, '');

  return (
    <main className="view-in">
      <Hero
        label={t('heroLabel')}
        title={p(c.hero.title)}
        line={p(c.hero.line)}
        slides={c.hero.slides.map((s) => ({ img: s.img, caption: p(s.caption) }))}
      />

      <section className="sec gut" id="series">
        <div className="sechead">
          <h2>{t('workTitle')}</h2>
          {p(c.work.intro) && <p>{p(c.work.intro)}</p>}
        </div>
        <div className="spread">
          {c.work.pieces.map((w, i) => (
            <figure key={w.img.src + i} className={`piece p${(i % 7) + 1}`}>
              <Develop className="frame">
                <SiteImage img={w.img} alt={p(w.title)} sizes={pieceSizes(w.img, i)} quality={80} />
              </Develop>
              <figcaption>
                <b>{p(w.title)}</b>
                <span>{p(w.meta)}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="about sec gut" id="about">
        <div className="in">
          {c.about.portrait ? (
            <figure className="me">
              <SiteImage img={c.about.portrait} alt={t('portraitPlaceholder')} sizes={portraitSizes(c.about.portrait)} />
            </figure>
          ) : (
            <figure className="me empty" aria-label={t('portraitPlaceholder')}>
              <figcaption>
                <IconCamera />
                Michael
              </figcaption>
            </figure>
          )}
          <div>
            <h2>{p(c.about.title)}</h2>
            <p>{p(c.about.p1)}</p>
            {p(c.about.p2) && <p>{p(c.about.p2)}</p>}
          </div>
        </div>
      </section>

      <footer className="sec gut foot" id="contact">
        <h2>{p(c.contact.heading)}</h2>
        <dl className="cinfo">
          <div>
            <dt>{t('email')}</dt>
            <dd>
              <a href={`mailto:${c.contact.email}`}>{c.contact.email}</a>
            </dd>
          </div>
          <div>
            <dt>{t('phone')}</dt>
            <dd>
              <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noopener noreferrer">
                {c.contact.phone}
              </a>
            </dd>
          </div>
          <div>
            <dt>Instagram</dt>
            <dd>
              <a href={`https://instagram.com/${ig}`} target="_blank" rel="noopener noreferrer">
                @{ig}
              </a>
            </dd>
          </div>
          <div>
            <dt>{t('basedIn')}</dt>
            <dd>{c.contact.location}</dd>
          </div>
          <div className="cbtn">
            <a className="pill solid" href={`mailto:${c.contact.email}`}>
              {t('contactCta')}
            </a>
          </div>
        </dl>
        <p className="small">{t('rights', { year: new Date().getFullYear() })}</p>
      </footer>
    </main>
  );
}
