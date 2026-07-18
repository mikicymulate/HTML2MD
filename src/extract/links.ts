import type { Page } from 'playwright';
import type { PageLink } from '../types';

/**
 * Collect every in-page hyperlink as an absolute URL plus its anchor text.
 *
 * IMPORTANT: this function is serialized and executed inside the browser via
 * `page.evaluate`, so it must be fully self-contained (no references to module-scope
 * identifiers) and rely only on DOM globals. It is also directly callable under jsdom in
 * unit tests when `document`/`window` are provided as globals.
 *
 * `<a>.href` (the property, not the attribute) is resolved against the document's base URL
 * by the DOM, so relative links come back absolute. Non-navigational schemes
 * (`mailto:`, `tel:`, `javascript:`, …) and fragment-only links are dropped, results are
 * deduped, and URL fragments are stripped so `/a#x` and `/a#y` collapse to one link.
 */
export function collectLinks(): PageLink[] {
  const anchors: Element[] = Array.from(document.querySelectorAll('a[href]'));
  const results: PageLink[] = [];
  const seen: Set<string> = new Set<string>();

  for (const el of anchors) {
    const resolved: string = (el as HTMLAnchorElement).href;
    if (!resolved) continue;

    let url: string;
    try {
      const u: URL = new URL(resolved);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      u.hash = '';
      url = u.href;
    } catch {
      continue;
    }

    if (seen.has(url)) continue;
    seen.add(url);

    const text: string = (el.textContent || '').replace(/\s+/g, ' ').trim();
    results.push({ url, text });
  }

  return results;
}

/** Run {@link collectLinks} against the live page. */
export async function mapLinks(page: Page): Promise<PageLink[]> {
  return page.evaluate(collectLinks);
}
