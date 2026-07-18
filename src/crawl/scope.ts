/**
 * Pure URL helpers for the crawler: normalization, scope matching, and include/exclude
 * filtering. Kept free of any browser/Playwright dependency so they can be unit-tested
 * directly.
 */

/**
 * How far from the seed the crawler is allowed to roam.
 *  - `host`   — only the exact same hostname as the seed (default).
 *  - `domain` — the same base domain (last two labels), so subdomains are included.
 *  - `prefix` — the same origin *and* a path at or under the seed's path (so a seed of
 *    `/docs` or `/docs/` keeps the crawl inside that section).
 */
export type CrawlScope = 'host' | 'domain' | 'prefix';

export const CRAWL_SCOPES: readonly CrawlScope[] = ['host', 'domain', 'prefix'];

/** Type guard for validating a raw scope string (e.g. from the CLI). */
export function isCrawlScope(value: string): value is CrawlScope {
  return (CRAWL_SCOPES as readonly string[]).includes(value);
}

/**
 * Normalize a raw URL to a canonical, comparable form, or return `null` if it is not an
 * http(s) URL. Fragments are stripped so `/a#x` and `/a#y` collapse to the same page.
 */
export function normalizeUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  u.hash = '';
  return u.href;
}

/** The registrable-ish base domain: the last two dot-separated labels of a hostname. */
function baseDomain(hostname: string): string {
  const labels: string[] = hostname.split('.').filter(Boolean);
  if (labels.length <= 2) return hostname;
  return labels.slice(-2).join('.');
}

/** Whether `candidate` is within the crawl `scope` relative to the `seed` URL. */
export function inScope(seed: URL, candidate: URL, scope: CrawlScope): boolean {
  switch (scope) {
    case 'host':
      return candidate.hostname === seed.hostname;
    case 'domain':
      return baseDomain(candidate.hostname) === baseDomain(seed.hostname);
    case 'prefix': {
      if (candidate.origin !== seed.origin) return false;
      const base: string = seed.pathname.replace(/\/+$/, '');
      if (base === '') return true;
      return candidate.pathname === base || candidate.pathname.startsWith(base + '/');
    }
  }
}

/** Compile an array of regex source strings into `RegExp`s, skipping invalid patterns. */
export function compileFilters(patterns: string[] | undefined): RegExp[] {
  if (!patterns || patterns.length === 0) return [];
  const out: RegExp[] = [];
  for (const p of patterns) {
    try {
      out.push(new RegExp(p));
    } catch {
      // Ignore malformed patterns rather than aborting the whole crawl.
    }
  }
  return out;
}

/**
 * A URL passes when it matches none of the `exclude` patterns and — if any `include`
 * patterns are given — at least one of them.
 */
export function matchesFilters(url: string, include: RegExp[], exclude: RegExp[]): boolean {
  if (exclude.some((re) => re.test(url))) return false;
  if (include.length > 0 && !include.some((re) => re.test(url))) return false;
  return true;
}
