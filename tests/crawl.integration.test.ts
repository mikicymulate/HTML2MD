import { test, expect } from '@playwright/test';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { crawlSite } from '../src/index';
import type { CrawlSummary } from '../src/index';

/**
 * A tiny linked site served locally so the crawler can be exercised end-to-end without any
 * network access:
 *
 *   /            → /a, /b, and an external link (out of scope)
 *   /a           → /c, back to /
 *   /b           → /a
 *   /c           → /a  (leaf, reachable only at depth 2)
 *   /robots.txt  → Disallow: /b
 */
function page(title: string, links: string[]): string {
  const anchors: string = links.map((h) => `<a href="${h}">${h}</a>`).join(' ');
  return `<!doctype html><html><head><title>${title}</title></head><body>
    <h1>${title}</h1><p>Some readable body text for ${title}.</p><nav>${anchors}</nav>
  </body></html>`;
}

const ROUTES: Record<string, string> = {
  '/': page('Home', ['/a', '/b', 'https://external.invalid/x']),
  '/a': page('Page A', ['/c', '/']),
  '/b': page('Page B', ['/a']),
  '/c': page('Page C', ['/a']),
};

let server: Server;
let base: string;

test.beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const path: string = (req.url ?? '/').split('?')[0] ?? '/';
    if (path === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('User-agent: *\nDisallow: /b\n');
      return;
    }
    const body: string | undefined = ROUTES[path];
    if (body === undefined) {
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>404</title>');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;
  base = `http://127.0.0.1:${addr.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test.describe('crawlSite (integration, real Chromium + local server)', () => {
  test('crawls all in-scope pages breadth-first and builds the link graph', async () => {
    test.setTimeout(90_000);
    const summary: CrawlSummary = await crawlSite(base, {
      scope: 'host',
      maxDepth: 2,
      respectRobots: false,
    });

    const byUrl = new Map(summary.pages.map((p) => [p.url, p]));
    expect(summary.stats.crawled).toBe(4);
    expect(byUrl.has(`${base}/`)).toBe(true);
    expect(byUrl.has(`${base}/a`)).toBe(true);
    expect(byUrl.has(`${base}/b`)).toBe(true);
    expect(byUrl.has(`${base}/c`)).toBe(true);

    // The external, out-of-scope link is neither crawled nor recorded in the graph.
    expect([...byUrl.keys()].some((u) => u.includes('external.invalid'))).toBe(false);
    expect(summary.graph[`${base}/`]).toEqual(
      expect.arrayContaining([`${base}/a`, `${base}/b`]),
    );
    expect(summary.graph[`${base}/`]?.some((u) => u.includes('external.invalid'))).toBe(false);

    // Depths: home = 0, its children = 1, /c (only via /a) = 2.
    expect(byUrl.get(`${base}/`)?.depth).toBe(0);
    expect(byUrl.get(`${base}/a`)?.depth).toBe(1);
    expect(byUrl.get(`${base}/c`)?.depth).toBe(2);

    // Successful pages carry their full extraction.
    expect(byUrl.get(`${base}/a`)?.result?.markdown).toContain('Page A');
  });

  test('respects maxDepth', async () => {
    test.setTimeout(90_000);
    const summary: CrawlSummary = await crawlSite(base, {
      scope: 'host',
      maxDepth: 1,
      respectRobots: false,
    });
    // depth 0: /, depth 1: /a, /b. /c (depth 2) is excluded.
    expect(summary.stats.crawled).toBe(3);
    expect(summary.pages.some((p) => p.url === `${base}/c`)).toBe(false);
  });

  test('respects maxPages', async () => {
    test.setTimeout(90_000);
    const summary: CrawlSummary = await crawlSite(base, {
      scope: 'host',
      maxPages: 2,
      respectRobots: false,
    });
    expect(summary.pages.length).toBe(2);
  });

  test('respects robots.txt when enabled', async () => {
    test.setTimeout(90_000);
    const summary: CrawlSummary = await crawlSite(base, {
      scope: 'host',
      maxDepth: 2,
      respectRobots: true,
    });
    // robots.txt disallows /b, so it is never fetched.
    expect(summary.pages.some((p) => p.url === `${base}/b`)).toBe(false);
    expect(summary.pages.some((p) => p.url === `${base}/a`)).toBe(true);
  });
});
