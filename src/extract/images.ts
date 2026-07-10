import type { ImageDesc, ImageDescriptionSource, VisionCaptioner } from '../types';
import { AD_DOMAINS } from '../config/blocklist';

/** Raw image record produced inside the browser by {@link collectImages}. */
export interface RawImage {
  src: string;
  alt: string;
  title: string;
  figcaption: string;
  width: number;
  height: number;
  role: string;
  ariaHidden: boolean;
}

/**
 * Collect `<img>` elements with resolved absolute src, alt/title/figcaption, and rendered
 * size. Self-contained for `page.evaluate` (and directly callable under jsdom in tests).
 */
export function collectImages(): RawImage[] {
  const imgs: HTMLImageElement[] = Array.from(document.querySelectorAll('img'));
  return imgs.map((img: HTMLImageElement) => {
    const rect: DOMRect = img.getBoundingClientRect();
    let figcaption: string = '';
    let p: Element | null = img.parentElement;
    while (p) {
      if (p.tagName === 'FIGURE') {
        figcaption = p.querySelector('figcaption')?.textContent?.trim() || '';
        break;
      }
      p = p.parentElement;
    }
    return {
      src: img.currentSrc || img.src || img.getAttribute('src') || '',
      alt: img.getAttribute('alt') || '',
      title: img.getAttribute('title') || '',
      figcaption,
      width: Math.round(rect.width) || img.naturalWidth || 0,
      height: Math.round(rect.height) || img.naturalHeight || 0,
      role: img.getAttribute('role') || '',
      ariaHidden: img.getAttribute('aria-hidden') === 'true',
    };
  });
}

export interface DescribeImagesOptions {
  describeImages?: boolean;
  visionCaptioner?: VisionCaptioner;
  minImageSize?: number;
}

function looksLikeFilename(text: string): boolean {
  return /\.(jpe?g|png|gif|webp|svg|avif)$/i.test(text.trim());
}

function isMeaningfulText(text: string): boolean {
  const t = text.trim();
  return t.length >= 2 && !looksLikeFilename(t);
}

function hostOf(src: string): string {
  try {
    return new URL(src, 'https://example.invalid/').hostname;
  } catch {
    return '';
  }
}

function isAdHost(host: string): boolean {
  return AD_DOMAINS.some((d: string) => host === d || host.endsWith('.' + d));
}

/**
 * Decide which images are "necessary" and produce a text description for each kept image.
 * Descriptions come from alt/caption/title, or an optional vision captioner when none exist.
 */
export async function describeImages(
  images: RawImage[],
  options: DescribeImagesOptions = {},
): Promise<ImageDesc[]> {
  const min: number = options.minImageSize ?? 64;
  const results: ImageDesc[] = [];

  for (const img of images) {
    const base: ImageDesc = {
      src: img.src,
      description: '',
      source: 'none',
      kept: false,
      width: img.width,
      height: img.height,
    };

    if (!img.src) {
      results.push({ ...base, reason: 'no-src' });
      continue;
    }
    const host: string = hostOf(img.src);
    if (host && isAdHost(host)) {
      results.push({ ...base, reason: 'ad-domain' });
      continue;
    }

    const altMeaningful: boolean = isMeaningfulText(img.alt);
    const maxDim: number = Math.max(img.width, img.height);

    // Tracking pixels / spacers.
    if (img.width > 0 && img.height > 0 && img.width <= 2 && img.height <= 2) {
      results.push({ ...base, reason: 'tracking-pixel' });
      continue;
    }
    // Decorative (explicitly marked) with no alt.
    if ((img.ariaHidden || img.role === 'presentation' || img.role === 'none') && !altMeaningful) {
      results.push({ ...base, reason: 'decorative' });
      continue;
    }
    // Too small to matter, unless it carries a meaningful alt (e.g., a logo).
    if (maxDim > 0 && maxDim < min && !altMeaningful) {
      results.push({ ...base, reason: 'too-small' });
      continue;
    }

    // Resolve a description in priority order.
    let description: string = '';
    let source: ImageDescriptionSource = 'none';
    if (altMeaningful) {
      description = img.alt.trim();
      source = 'alt';
    } else if (isMeaningfulText(img.figcaption)) {
      description = img.figcaption.trim();
      source = 'caption';
    } else if (isMeaningfulText(img.title)) {
      description = img.title.trim();
      source = 'title';
    } else if (options.describeImages && options.visionCaptioner) {
      try {
        description = (
          await options.visionCaptioner.describe({
            src: img.src,
            contextText: img.figcaption || img.title || undefined,
          })
        ).trim();
        source = description ? 'vision' : 'none';
      } catch {
        description = '';
        source = 'none';
      }
    }

    results.push({ ...base, description, source, kept: true });
  }

  return results;
}
