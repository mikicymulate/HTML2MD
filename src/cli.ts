#!/usr/bin/env node
import { Command } from 'commander';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { crawlSite, extractPage } from './index';
import type { CrawlPage } from './index';
import { isCrawlScope } from './crawl/scope';
import { slugify } from './util/slug';

interface ExtractCliOptions {
  out: string;
  describeImages: boolean;
  screenshot: boolean;
  embedJson: boolean;
  headless: boolean;
  blockAds: boolean;
  timeout: string;
}

interface CrawlCliOptions {
  out: string;
  maxDepth: string;
  maxPages: string;
  concurrency: string;
  scope: string;
  delay: string;
  include?: string[];
  exclude?: string[];
  robots: boolean;
  describeImages: boolean;
  embedJson: boolean;
  headless: boolean;
  blockAds: boolean;
  timeout: string;
}

/** Derive a filesystem-safe, collision-free slug for a page within a crawl. */
function uniqueSlug(url: string, used: Set<string>): string {
  const base: string = slugify(url) || 'page';
  let slug: string = base;
  let n: number = 2;
  while (used.has(slug)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  used.add(slug);
  return slug;
}

const program = new Command();

program
  .name('html2md')
  .description(
    'Turn any web page into clean, AI-consumable Markdown with an interactive-element map.',
  );

program
  .command('extract', { isDefault: true })
  .description('Extract a single page as clean Markdown plus element/image maps')
  .argument('<input>', 'URL, local HTML file path, or file:// URL')
  .option('-o, --out <dir>', 'output directory', 'out')
  .option('--describe-images', 'describe meaningful images (alt/caption based)', false)
  .option('--screenshot', 'save a full-page screenshot of the cleaned page', false)
  .option('--no-embed-json', 'do not embed the raw element/image JSON in page.md')
  .option('--no-headless', 'run the browser with a visible window')
  .option('--no-block-ads', 'do not block ad/analytics network requests')
  .option('--timeout <ms>', 'navigation timeout in milliseconds', '30000')
  .action(async (input: string, opts: ExtractCliOptions) => {
    const outDir: string = resolve(opts.out, slugify(input));
    await mkdir(outDir, { recursive: true });
    const screenshotPath: string | undefined = opts.screenshot
      ? join(outDir, 'screenshot.png')
      : undefined;

    const result = await extractPage(input, {
      headless: opts.headless,
      blockAds: opts.blockAds,
      describeImages: opts.describeImages,
      timeoutMs: Number(opts.timeout),
      screenshotPath,
      embedJson: opts.embedJson,
    });

    await writeFile(join(outDir, 'page.md'), result.markdown, 'utf8');
    await writeFile(join(outDir, 'elements.json'), JSON.stringify(result.elements, null, 2), 'utf8');
    await writeFile(join(outDir, 'images.json'), JSON.stringify(result.images, null, 2), 'utf8');

    const keptImages: number = result.images.filter((i) => i.kept).length;
    process.stdout.write(`✓ ${join(outDir, 'page.md')}\n`);
    process.stdout.write(
      `  ${result.elements.length} interactive elements, ${keptImages} images described\n`,
    );
    if (screenshotPath) process.stdout.write(`  screenshot: ${screenshotPath}\n`);
  });

program
  .command('crawl')
  .description('Crawl a site from a seed URL, extracting every in-scope page to Markdown')
  .argument('<url>', 'seed URL to start crawling from')
  .option('-o, --out <dir>', 'output directory', 'out')
  .option('--max-depth <n>', 'maximum link depth from the seed (seed = 0)', '2')
  .option('--max-pages <n>', 'maximum number of pages to fetch', '50')
  .option('--concurrency <n>', 'number of pages to fetch in parallel', '3')
  .option('--scope <scope>', 'link scope: host | domain | prefix', 'host')
  .option('--delay <ms>', 'politeness delay between requests per worker', '0')
  .option('--include <regex...>', 'only crawl URLs matching at least one of these regexes')
  .option('--exclude <regex...>', 'skip URLs matching any of these regexes')
  .option('--no-robots', 'do not fetch or respect robots.txt')
  .option('--describe-images', 'describe meaningful images (alt/caption based)', false)
  .option('--no-embed-json', 'do not embed the raw element/image JSON in each page.md')
  .option('--no-headless', 'run the browser with a visible window')
  .option('--no-block-ads', 'do not block ad/analytics network requests')
  .option('--timeout <ms>', 'navigation timeout in milliseconds', '30000')
  .action(async (seed: string, opts: CrawlCliOptions) => {
    if (!isCrawlScope(opts.scope)) {
      throw new Error(`invalid --scope "${opts.scope}" (expected host, domain, or prefix)`);
    }

    const rootDir: string = resolve(opts.out, slugify(seed));
    const pagesDir: string = join(rootDir, 'pages');
    await mkdir(pagesDir, { recursive: true });

    const summary = await crawlSite(seed, {
      maxDepth: Number(opts.maxDepth),
      maxPages: Number(opts.maxPages),
      concurrency: Number(opts.concurrency),
      scope: opts.scope,
      delayMs: Number(opts.delay),
      include: opts.include,
      exclude: opts.exclude,
      respectRobots: opts.robots,
      describeImages: opts.describeImages,
      embedJson: opts.embedJson,
      headless: opts.headless,
      blockAds: opts.blockAds,
      timeoutMs: Number(opts.timeout),
      onPage: (p: CrawlPage) => {
        const mark: string = p.ok ? '✓' : '✗';
        const suffix: string = p.error ? ` — ${p.error}` : '';
        process.stdout.write(`${mark} [d${p.depth}] ${p.url}${suffix}\n`);
      },
    });

    const used: Set<string> = new Set<string>();
    const indexLines: string[] = [
      `# Crawl of ${summary.seed}`,
      '',
      `${summary.stats.crawled} page(s) crawled, ${summary.stats.failed} failed, ` +
        `${summary.stats.discovered} in-scope link(s) discovered.`,
      '',
    ];
    const manifestPages: Array<Record<string, unknown>> = [];

    for (const page of summary.pages) {
      if (!page.ok || !page.result) {
        manifestPages.push({ url: page.url, depth: page.depth, ok: false, error: page.error });
        continue;
      }
      const slug: string = uniqueSlug(page.url, used);
      const dir: string = join(pagesDir, slug);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'page.md'), page.result.markdown, 'utf8');
      await writeFile(
        join(dir, 'elements.json'),
        JSON.stringify(page.result.elements, null, 2),
        'utf8',
      );
      await writeFile(join(dir, 'images.json'), JSON.stringify(page.result.images, null, 2), 'utf8');
      indexLines.push(
        `- [${page.title || page.url}](pages/${slug}/page.md) — \`${page.url}\` (depth ${page.depth})`,
      );
      manifestPages.push({
        url: page.url,
        depth: page.depth,
        ok: true,
        title: page.title,
        dir: `pages/${slug}`,
      });
    }

    await writeFile(join(rootDir, 'index.md'), indexLines.join('\n') + '\n', 'utf8');
    await writeFile(
      join(rootDir, 'crawl.json'),
      JSON.stringify(
        {
          seed: summary.seed,
          scope: summary.scope,
          startedAt: summary.startedAt,
          finishedAt: summary.finishedAt,
          stats: summary.stats,
          pages: manifestPages,
          graph: summary.graph,
        },
        null,
        2,
      ),
      'utf8',
    );

    process.stdout.write(
      `\n✓ Crawl complete: ${summary.stats.crawled} page(s) → ${join(rootDir, 'index.md')}\n`,
    );
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`html2md: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
