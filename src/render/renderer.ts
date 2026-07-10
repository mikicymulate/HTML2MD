import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { AD_DOMAINS } from '../config/blocklist';
import type { ExtractOptions } from '../types';

export interface RenderedPage {
  /** The live Playwright page, ready for extraction / interaction. */
  page: Page;
  /** The rendered HTML at load time (page.content()). */
  html: string;
  /** The resolved final URL (after redirects), or the original input for raw HTML. */
  url: string;
  title: string;
  /** Tears down the page, context, and browser. */
  close: () => Promise<void>;
}

export type InputKind = 'url' | 'file' | 'html';

const DEFAULTS = {
  headless: true,
  timeoutMs: 30_000,
  waitUntil: 'domcontentloaded' as const,
  viewport: { width: 1280, height: 900 },
  blockAds: true,
};

/** Classify a raw input string as a URL, a local file path, or a raw HTML document. */
export function classifyInput(input: string): { kind: InputKind; value: string } {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed) || /^file:\/\//i.test(trimmed)) {
    return { kind: 'url', value: trimmed };
  }
  // Looks like raw HTML markup.
  if (/^\s*</.test(trimmed) && /<\/?[a-z!][\s\S]*>/i.test(trimmed)) {
    return { kind: 'html', value: trimmed };
  }
  return { kind: 'file', value: trimmed };
}

function hostMatchesBlocklist(host: string): boolean {
  return AD_DOMAINS.some((domain) => host === domain || host.endsWith('.' + domain));
}

/**
 * Retrieve page HTML resiliently. `page.content()` throws while the main frame is mid-
 * navigation (client-side redirects, meta refresh); retry after letting it settle.
 */
export async function safeContent(page: Page): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await page.content();
    } catch {
      await page.waitForLoadState('load', { timeout: 3_000 }).catch(() => undefined);
      await page.waitForTimeout(200).catch(() => undefined);
    }
  }
  try {
    return await page.evaluate(() => document.documentElement.outerHTML);
  } catch {
    return '';
  }
}

/**
 * Launch Chromium, load the input, and return a live page plus its rendered HTML.
 * The caller is responsible for calling `close()` when done.
 */
export async function renderPage(
  input: string,
  options: ExtractOptions = {},
): Promise<RenderedPage> {
  const opts = { ...DEFAULTS, ...options };
  const browser: Browser = await chromium.launch({ headless: opts.headless });
  const context: BrowserContext = await browser.newContext({
    viewport: opts.viewport,
    userAgent: options.userAgent,
  });
  const page: Page = await context.newPage();

  if (opts.blockAds) {
    await context.route('**/*', (route) => {
      let host: string;
      try {
        host = new URL(route.request().url()).hostname;
      } catch {
        host = '';
      }
      if (host && hostMatchesBlocklist(host)) {
        void route.abort();
        return;
      }
      void route.continue();
    });
  }

  const { kind, value } = classifyInput(input);

  try {
    if (kind === 'html') {
      await page.setContent(value, { waitUntil: opts.waitUntil, timeout: opts.timeoutMs });
    } else {
      const target = kind === 'file' ? pathToFileURL(resolve(value)).href : value;
      await page.goto(target, { waitUntil: opts.waitUntil, timeout: opts.timeoutMs });
    }
    // Best-effort settle for late-loading content; ignore timeouts.
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
  } catch (err) {
    // Navigation may time out on long-polling pages; continue with whatever loaded,
    // but re-throw if nothing loaded at all.
    if ((await safeContent(page)).length < 50) {
      await context.close();
      await browser.close();
      throw err;
    }
  }

  const html = await safeContent(page);
  const title = await page.title().catch(() => '');
  const currentUrl = page.url();
  const url = kind === 'html' || currentUrl === 'about:blank' ? input : currentUrl;

  const close = async () => {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  };

  return { page, html, url, title, close };
}
