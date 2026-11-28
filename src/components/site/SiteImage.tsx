'use client';

import Image, { type ImageProps } from 'next/image';
import type { Img } from '@/lib/content-types';
import { focusPosition, isMediaSrc, mediaLoader } from '@/lib/site-images';

/**
 * A Studio image filling its frame. Uploads are served from their pre-encoded
 * sizes (no resizing on request); the bundled samples go through next/image.
 * The focus point decides which part stays in frame when the photo is cropped.
 */
export function SiteImage({ img, style, ...rest }: Omit<ImageProps, 'src' | 'fill'> & { img: Img }) {
  const media = isMediaSrc(img.src);
  return (
    <Image
      {...rest}
      src={img.src}
      fill
      loader={media ? mediaLoader : undefined}
      placeholder={img.blur ? (img.blur as `data:image/${string}`) : 'empty'}
      style={{ objectPosition: focusPosition(img.focus), ...style }}
    />
  );
}
