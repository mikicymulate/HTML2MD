import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import type { Page } from 'playwright';
import { AD_SELECTORS } from '../config/blocklist';

export interface ExtractedContent {
  title: string;
  byline: string | null;
  excerpt: string | null;
  /** Sanitized main-content HTML (article body). */
  contentHtml: string;
  textContent: string;
  /** Whether Readability produced the content (vs. a body fallback). */
  usedReadability: boolean;
}

/**
 * Remove ads, trackers, cookie/consent banners, scripts, styles, and hidden nodes from the
 * live page DOM. Runs in the browser context so it affects both the element map and the
 * screenshot, not just the extracted HTML.
 */
export async function sanitizeLivePage(page: Page, extraSelectors: string[] = []): Promise<void> {
  const selectors = [...AD_SELECTORS, ...extraSelectors];
  await page.evaluate((sels: string[]) => {
    for (const sel of sels) {
      let matched: NodeListOf<Element>;
      try {
        matched = document.querySelectorAll(sel);
      } catch {
        continue; // skip selectors the browser rejects
      }
      matched.forEach((node) => node.remove());
    }
    // Strip HTML comments.
    const root = document.documentElement;
    if (root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
      const comments: Node[] = [];
      while (walker.nextNode()) comments.push(walker.currentNode);
      for (const c of comments) c.parentNode?.removeChild(c);
    }
  }, selectors);
}

/**
 * Isolate the main readable content from an HTML document using Mozilla Readability,
 * falling back to the document body when Readability can't find an article.
 */
export function extractContent(html: string, url: string): ExtractedContent {
  const safeUrl = /^https?:|^file:/i.test(url) ? url : 'https://example.invalid/';
  const dom = new JSDOM(html, { url: safeUrl });
  const doc = dom.window.document;

  // Readability mutates the document, so parse a clone and keep the original for fallback.
  let article: ReturnType<Readability['parse']>;
  try {
    const clone = doc.cloneNode(true) as Document;
    article = new Readability(clone).parse();
  } catch {
    article = null;
  }

  if (article && article.content && (article.textContent ?? '').trim().length > 200) {
    return {
      title: article.title || doc.title || '',
      byline: article.byline ?? null,
      excerpt: article.excerpt ?? null,
      contentHtml: article.content,
      textContent: article.textContent ?? '',
      usedReadability: true,
    };
  }

  return {
    title: doc.title || '',
    byline: null,
    excerpt: null,
    contentHtml: doc.body?.innerHTML ?? html,
    textContent: doc.body?.textContent ?? '',
    usedReadability: false,
  };
}
