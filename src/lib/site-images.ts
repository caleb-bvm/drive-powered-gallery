/*
 * Responsive sizes for images uploaded in the Studio (hero, selected work,
 * portrait). Each upload is encoded once, at these widths, in AVIF and WebP,
 * so pages never resize photos on the fly.
 */
import type { ImageLoader } from 'next/image';
import type { Focus, Img } from '@/lib/content-types';

export const SITE_WIDTHS = [640, 960, 1280, 1920, 2560, 3200] as const;

export const isMediaSrc = (src: string) => src.startsWith('/api/media/');

/** Smallest stored width that covers the requested one. */
export const pickWidth = (want: number) => SITE_WIDTHS.find((w) => w >= want) ?? SITE_WIDTHS[SITE_WIDTHS.length - 1];

export const mediaUrl = (src: string, width: number) => src.replace(/\/(lg|sm|\d+)$/, `/${pickWidth(width)}`);

/** next/image loader for Studio uploads: points each srcset entry at a pre-encoded width. */
export const mediaLoader: ImageLoader = ({ src, width }) => mediaUrl(src, width);

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

/** CSS position for the part of the photo that must stay in frame when it is cropped. */
export const focusPosition = (f?: Focus) => (f ? `${clamp(f.x)}% ${clamp(f.y)}%` : '50% 50%');

/**
 * `sizes` for a photo filling a frame with object-fit: cover. When the photo is
 * wider than its frame (a 3:2 photo in a 4:5 frame), it is drawn wider than the
 * frame, so the browser needs a larger file to stay sharp.
 */
export function coverScale(img: Pick<Img, 'w' | 'h'>, frameRatio: number) {
  const ratio = img.w && img.h ? img.w / img.h : 1.5;
  return Math.max(1, ratio / frameRatio);
}
