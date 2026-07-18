import { test, expect } from '@playwright/test';
import {
  compileFilters,
  inScope,
  isCrawlScope,
  matchesFilters,
  normalizeUrl,
} from '../src/crawl/scope';
import { parseRobots } from '../src/crawl/robots';

test.describe('normalizeUrl', () => {
  test('keeps http(s) URLs and strips the fragment', () => {
    expect(normalizeUrl('https://a.com/x#frag')).toBe('https://a.com/x');
    expect(normalizeUrl('http://a.com/')).toBe('http://a.com/');
  });

  test('rejects non-http schemes and garbage', () => {
    expect(normalizeUrl('mailto:a@b.com')).toBeNull();
    expect(normalizeUrl('ftp://a.com/x')).toBeNull();
    expect(normalizeUrl('not a url')).toBeNull();
  });
});

test.describe('inScope', () => {
  const seed = new URL('https://www.example.com/docs/guide');

  test('host scope requires the exact hostname', () => {
    expect(inScope(seed, new URL('https://www.example.com/other'), 'host')).toBe(true);
    expect(inScope(seed, new URL('https://blog.example.com/x'), 'host')).toBe(false);
  });

  test('domain scope allows subdomains of the same base domain', () => {
    expect(inScope(seed, new URL('https://blog.example.com/x'), 'domain')).toBe(true);
    expect(inScope(seed, new URL('https://example.com/x'), 'domain')).toBe(true);
    expect(inScope(seed, new URL('https://example.org/x'), 'domain')).toBe(false);
  });

  test('prefix scope requires the same origin under the seed path', () => {
    expect(inScope(seed, new URL('https://www.example.com/docs/guide/intro'), 'prefix')).toBe(true);
    expect(inScope(seed, new URL('https://www.example.com/docs/guide'), 'prefix')).toBe(true);
    expect(inScope(seed, new URL('https://www.example.com/docsguide'), 'prefix')).toBe(false);
    expect(inScope(seed, new URL('https://www.example.com/api'), 'prefix')).toBe(false);
    expect(inScope(seed, new URL('https://other.example.com/docs/guide/x'), 'prefix')).toBe(false);
  });
});

test.describe('filters', () => {
  test('exclude wins, and include (when present) is required', () => {
    const inc = compileFilters(['/blog/']);
    const exc = compileFilters(['\\.pdf$']);
    expect(matchesFilters('https://a.com/blog/post', inc, exc)).toBe(true);
    expect(matchesFilters('https://a.com/about', inc, exc)).toBe(false); // fails include
    expect(matchesFilters('https://a.com/blog/report.pdf', inc, exc)).toBe(false); // hits exclude
  });

  test('no filters means everything passes; bad patterns are skipped', () => {
    expect(matchesFilters('https://a.com/x', [], [])).toBe(true);
    expect(compileFilters(['(unclosed'])).toHaveLength(0);
  });
});

test.describe('isCrawlScope', () => {
  test('validates scope strings', () => {
    expect(isCrawlScope('host')).toBe(true);
    expect(isCrawlScope('prefix')).toBe(true);
    expect(isCrawlScope('everything')).toBe(false);
  });
});

test.describe('parseRobots', () => {
  test('honors a simple Disallow for the wildcard agent', () => {
    const r = parseRobots('User-agent: *\nDisallow: /private', 'html2md-crawler');
    expect(r.isAllowed('/private/secret')).toBe(false);
    expect(r.isAllowed('/public')).toBe(true);
  });

  test('a named agent group overrides the wildcard group', () => {
    const txt = ['User-agent: *', 'Disallow: /', '', 'User-agent: html2md-crawler', 'Allow: /'].join(
      '\n',
    );
    const r = parseRobots(txt, 'html2md-crawler');
    expect(r.isAllowed('/anything')).toBe(true);
  });

  test('longest match wins and Allow beats Disallow on ties', () => {
    const r = parseRobots('User-agent: *\nDisallow: /a\nAllow: /a/b', 'html2md-crawler');
    expect(r.isAllowed('/a/x')).toBe(false);
    expect(r.isAllowed('/a/b/c')).toBe(true);
  });

  test('supports * wildcards and $ end-anchors', () => {
    const r = parseRobots('User-agent: *\nDisallow: /*.pdf$', 'html2md-crawler');
    expect(r.isAllowed('/files/report.pdf')).toBe(false);
    expect(r.isAllowed('/files/report.pdf.html')).toBe(true);
  });

  test('an empty Disallow imposes no constraint', () => {
    const r = parseRobots('User-agent: *\nDisallow:', 'html2md-crawler');
    expect(r.isAllowed('/anything')).toBe(true);
  });
});
