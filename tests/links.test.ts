import { test, expect } from '@playwright/test';
import { JSDOM } from 'jsdom';
import { collectLinks } from '../src/extract/links';
import type { PageLink } from '../src/types';

const HTML = `<!doctype html><html><body>
  <a href="/about">About us</a>
  <a href="sub/page">Relative child</a>
  <a href="https://other.example.org/y">External</a>
  <a href="/about#team">About (dupe with fragment)</a>
  <a href="#top">Skip to top</a>
  <a href="mailto:hi@example.com">Email</a>
  <a href="tel:+15551234">Call</a>
  <a href="javascript:void(0)">JS link</a>
  <a>No href at all</a>
</body></html>`;

// collectLinks is written to run in a DOM context; provide one via jsdom globals.
const g = globalThis as unknown as Record<string, unknown>;
let dom: JSDOM;

test.beforeAll(() => {
  dom = new JSDOM(HTML, { url: 'https://example.com/dir/index.html' });
  g.document = dom.window.document;
  g.window = dom.window;
});

test.afterAll(() => {
  delete g.document;
  delete g.window;
});

test.describe('collectLinks', () => {
  test('resolves relative links to absolute URLs against the document base', () => {
    const links: PageLink[] = collectLinks();
    const urls: string[] = links.map((l) => l.url);
    expect(urls).toContain('https://example.com/about');
    expect(urls).toContain('https://example.com/dir/sub/page');
    expect(urls).toContain('https://other.example.org/y');
  });

  test('drops non-navigational schemes (mailto, tel, javascript)', () => {
    const urls: string[] = collectLinks().map((l) => l.url);
    expect(urls.some((u) => u.startsWith('mailto:'))).toBe(false);
    expect(urls.some((u) => u.startsWith('tel:'))).toBe(false);
    expect(urls.some((u) => u.startsWith('javascript:'))).toBe(false);
  });

  test('strips fragments and dedupes links to the same target', () => {
    const urls: string[] = collectLinks().map((l) => l.url);
    // "/about" and "/about#team" collapse to a single entry.
    expect(urls.filter((u) => u === 'https://example.com/about')).toHaveLength(1);
    // A pure "#top" fragment resolves to the current page (fragment stripped).
    expect(urls).toContain('https://example.com/dir/index.html');
  });

  test('captures trimmed anchor text', () => {
    const about: PageLink | undefined = collectLinks().find(
      (l) => l.url === 'https://example.com/about',
    );
    expect(about?.text).toBe('About us');
  });
});
