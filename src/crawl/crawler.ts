/**
 * Multi-page crawler. Starting from a seed URL it follows in-scope links breadth-first,
 * running the full single-page extraction ({@link extractPage}) on each page, and returns
 * every page's Markdown plus the discovered link graph.
 *
 * Concurrency, depth, and total page count are all bounded; `robots.txt` is respected by
 * default; and an optional politeness delay throttles each worker.
 */
import { extractPage } from '../index';
import type { ExtractOptions, PageResult } from '../types';
import {
  type CrawlScope,
  compileFilters,
  inScope,
  matchesFilters,
  normalizeUrl,
} from './scope';
import { ALLOW_ALL, fetchRobots, type RobotsRules } from './robots';

export type { CrawlScope } from './scope';

/** User-agent token used for robots.txt group matching and the robots.txt request. */
const CRAWLER_UA = 'html2md-crawler';

const DEFAULTS = {
  maxDepth: 2,
  maxPages: 50,
  concurrency: 3,
  scope: 'host' as CrawlScope,
  delayMs: 0,
  respectRobots: true,
};

export interface CrawlOptions extends ExtractOptions {
  /** Maximum link depth from the seed (seed = depth 0). Default 2. */
  maxDepth?: number;
  /** Hard cap on the number of pages fetched. Default 50. */
  maxPages?: number;
  /** Number of pages fetched in parallel. Default 3. */
  concurrency?: number;
  /** How far from the seed the crawler may roam. Default 'host'. */
  scope?: CrawlScope;
  /** Delay (ms) applied per worker after each fetch, to be polite. Default 0. */
  delayMs?: number;
  /** Only crawl URLs matching at least one of these regex sources. */
  include?: string[];
  /** Skip URLs matching any of these regex sources. */
  exclude?: string[];
  /** Fetch and honor robots.txt for the seed origin. Default true. */
  respectRobots?: boolean;
  /** Invoked once per page as it finishes (success or failure), in completion order. */
  onPage?: (page: CrawlPage) => void;
}

export interface CrawlPage {
  /** The normalized URL that was fetched. */
  url: string;
  /** Link depth from the seed (seed = 0). */
  depth: number;
  /** Whether extraction succeeded. */
  ok: boolean;
  title?: string;
  /** Error message when `ok` is false. */
  error?: string;
  /** In-scope, normalized links found on this page (the page's outgoing graph edges). */
  links: string[];
  /** Full extraction result; present only when `ok` is true. */
  result?: PageResult;
  fetchedAt: string;
}

export interface CrawlStats {
  /** Pages extracted successfully. */
  crawled: number;
  /** Pages that errored. */
  failed: number;
  /** Total in-scope link edges discovered across all pages. */
  discovered: number;
}

export interface CrawlSummary {
  /** The normalized seed URL. */
  seed: string;
  scope: CrawlScope;
  startedAt: string;
  finishedAt: string;
  /** Every visited page, in completion order. */
  pages: CrawlPage[];
  /** Adjacency list: page URL → in-scope URLs it links to. */
  graph: Record<string, string[]>;
  stats: CrawlStats;
}

interface QueueItem {
  url: string;
  depth: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Crawl a website starting from `seedInput`.
 *
 * @param seedInput An http(s) URL to start from.
 * @param options   Crawl bounds plus any {@link ExtractOptions} to apply to every page.
 */
export async function crawlSite(
  seedInput: string,
  options: CrawlOptions = {},
): Promise<CrawlSummary> {
  const startedAt: string = new Date().toISOString();

  const seedUrl: string | null = normalizeUrl(seedInput);
  if (!seedUrl) {
    throw new Error(`crawlSite requires an http(s) URL to start from, got: ${seedInput}`);
  }
  const seed: URL = new URL(seedUrl);

  const {
    maxDepth = DEFAULTS.maxDepth,
    maxPages = DEFAULTS.maxPages,
    concurrency: rawConcurrency = DEFAULTS.concurrency,
    scope = DEFAULTS.scope,
    delayMs: rawDelay = DEFAULTS.delayMs,
    include,
    exclude,
    respectRobots = DEFAULTS.respectRobots,
    onPage,
    ...extract
  } = options;

  const concurrency: number = Math.max(1, rawConcurrency);
  const delayMs: number = Math.max(0, rawDelay);
  const includeRes: RegExp[] = compileFilters(include);
  const excludeRes: RegExp[] = compileFilters(exclude);
  const extractOptions: ExtractOptions = { ...extract, collectLinks: true };

  const robots: RobotsRules = respectRobots
    ? await fetchRobots(seed.origin, CRAWLER_UA, extract.timeoutMs ?? 30_000)
    : ALLOW_ALL;

  const scheduled: Set<string> = new Set<string>();
  const queue: QueueItem[] = [];
  const pages: CrawlPage[] = [];
  const graph: Record<string, string[]> = {};

  /** Schedule a URL if it is new, in scope, allowed, and under the page cap. */
  function enqueue(url: string, depth: number): void {
    if (scheduled.has(url)) return;
    if (scheduled.size >= maxPages) return;
    let candidate: URL;
    try {
      candidate = new URL(url);
    } catch {
      return;
    }
    if (!inScope(seed, candidate, scope)) return;
    if (!matchesFilters(url, includeRes, excludeRes)) return;
    if (respectRobots && !robots.isAllowed(candidate.pathname + candidate.search)) return;
    scheduled.add(url);
    queue.push({ url, depth });
  }

  enqueue(seedUrl, 0);

  async function processItem(item: QueueItem): Promise<void> {
    const fetchedAt: string = new Date().toISOString();
    try {
      const result: PageResult = await extractPage(item.url, extractOptions);

      const outgoing: string[] = [];
      const seenOnPage: Set<string> = new Set<string>();
      for (const link of result.links ?? []) {
        const norm: string | null = normalizeUrl(link.url);
        if (!norm) continue;
        let target: URL;
        try {
          target = new URL(norm);
        } catch {
          continue;
        }
        if (!inScope(seed, target, scope)) continue;
        if (!seenOnPage.has(norm)) {
          seenOnPage.add(norm);
          outgoing.push(norm);
        }
        if (item.depth < maxDepth) enqueue(norm, item.depth + 1);
      }

      graph[item.url] = outgoing;
      const page: CrawlPage = {
        url: item.url,
        depth: item.depth,
        ok: true,
        title: result.title,
        links: outgoing,
        result,
        fetchedAt,
      };
      pages.push(page);
      onPage?.(page);
    } catch (err) {
      graph[item.url] = [];
      const page: CrawlPage = {
        url: item.url,
        depth: item.depth,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        links: [],
        fetchedAt,
      };
      pages.push(page);
      onPage?.(page);
    }
  }

  // Worker pool over a queue that grows as pages are discovered. Each completion pulls the
  // next item (or new items enqueued by in-flight workers) until the queue drains.
  await new Promise<void>((resolveAll) => {
    let cursor: number = 0;
    let active: number = 0;

    const pump = (): void => {
      if (cursor >= queue.length && active === 0) {
        resolveAll();
        return;
      }
      while (active < concurrency && cursor < queue.length) {
        const item: QueueItem = queue[cursor]!;
        cursor += 1;
        active += 1;
        void processItem(item)
          .then(() => (delayMs > 0 ? sleep(delayMs) : undefined))
          .finally(() => {
            active -= 1;
            pump();
          });
      }
    };

    pump();
  });

  const crawled: number = pages.filter((p) => p.ok).length;
  const discovered: number = Object.values(graph).reduce((n, list) => n + list.length, 0);

  return {
    seed: seedUrl,
    scope,
    startedAt,
    finishedAt: new Date().toISOString(),
    pages,
    graph,
    stats: { crawled, failed: pages.length - crawled, discovered },
  };
}
