/**
 * MCP (Model Context Protocol) server exposing html2md-ai to AI coding agents.
 *
 * Tools:
 *  - extract_page:     full AI Markdown document for a page
 *  - extract_elements: machine-readable interactive-element map
 *  - extract_images:   meaningful images with text descriptions
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { crawlSite, extractPage } from '../index';
import type { CrawlSummary } from '../index';
import type { ExtractOptions, PageResult } from '../types';

const SERVER_NAME = 'html2md';
const SERVER_VERSION = '0.1.0';

/** Input accepted by every tool: the page to extract plus rendering options. */
const commonInputShape = {
  input: z
    .string()
    .describe('URL, local HTML file path, file:// URL, or raw HTML string to extract'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Navigation timeout in milliseconds (default 30000)'),
  blockAds: z
    .boolean()
    .optional()
    .describe('Block ad/analytics network requests (default true)'),
  waitUntil: z
    .enum(['load', 'domcontentloaded', 'networkidle', 'commit'])
    .optional()
    .describe("Playwright load state to wait for on navigation (default 'domcontentloaded')"),
  extraStripSelectors: z
    .array(z.string())
    .optional()
    .describe('Extra CSS selectors to strip from the page before extraction'),
};

const boundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

const elementNodeSchema = z.object({
  ref: z.string().describe('Stable reference in document order, e.g. "e6"'),
  kind: z.enum([
    'textfield',
    'textarea',
    'button',
    'submit',
    'link',
    'select',
    'checkbox',
    'radio',
    'file',
    'other',
  ]),
  label: z.string(),
  name: z.string().optional(),
  value: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().optional(),
  disabled: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  href: z.string().optional(),
  role: z.string().optional(),
  selector: z.string().describe('Robust selector usable to drive the element'),
  box: boundingBoxSchema.optional(),
  howToInteract: z.string(),
});

const imageDescSchema = z.object({
  src: z.string(),
  description: z.string(),
  source: z.enum(['alt', 'caption', 'title', 'vision', 'none']),
  kept: z.boolean(),
  width: z.number().optional(),
  height: z.number().optional(),
  reason: z.string().optional(),
});

interface CommonInput {
  input: string;
  timeoutMs?: number;
  blockAds?: boolean;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
  extraStripSelectors?: string[];
}

function toExtractOptions(args: CommonInput): ExtractOptions {
  return {
    timeoutMs: args.timeoutMs,
    blockAds: args.blockAds,
    waitUntil: args.waitUntil,
    extraStripSelectors: args.extraStripSelectors,
  };
}

function errorResult(err: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
    isError: true,
  };
}

const crawlPageSchema = z.object({
  url: z.string(),
  depth: z.number().int(),
  ok: z.boolean(),
  title: z.string().optional(),
  error: z.string().optional(),
  /** Full page Markdown, included only when `includeMarkdown` is set. */
  markdown: z.string().optional(),
});

const crawlEdgeSchema = z.object({
  from: z.string(),
  to: z.array(z.string()),
});

const readOnlyAnnotations = { readOnlyHint: true, openWorldHint: true } as const;

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    'extract_page',
    {
      title: 'Extract page as Markdown',
      description:
        'Render a web page (URL, local HTML file, or raw HTML) in headless Chromium, strip ads/trackers/cookie banners, and return a clean AI-consumable Markdown document with YAML frontmatter, an Images section, and an Interactive Elements appendix.',
      inputSchema: {
        ...commonInputShape,
        describeImages: z
          .boolean()
          .optional()
          .describe('Include text descriptions of meaningful images (default false)'),
        embedJson: z
          .boolean()
          .optional()
          .describe('Embed the raw element/image JSON as fenced code blocks (default false)'),
        maxElements: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Maximum number of interactive elements to map (default 500)'),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ describeImages, embedJson, maxElements, ...common }): Promise<CallToolResult> => {
      try {
        const result: PageResult = await extractPage(common.input, {
          ...toExtractOptions(common),
          describeImages,
          embedJson,
          maxElements,
        });
        return { content: [{ type: 'text', text: result.markdown }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'extract_elements',
    {
      title: 'Map interactive elements',
      description:
        'Render a web page and return a machine-readable map of its interactive elements (text fields, buttons, selects, checkboxes, links) with stable refs, resolved labels, robust selectors, and interaction hints.',
      inputSchema: {
        ...commonInputShape,
        maxElements: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Maximum number of interactive elements to map (default 500)'),
      },
      outputSchema: {
        url: z.string(),
        title: z.string(),
        elements: z.array(elementNodeSchema),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ maxElements, ...common }): Promise<CallToolResult> => {
      try {
        const result: PageResult = await extractPage(common.input, {
          ...toExtractOptions(common),
          maxElements,
        });
        const output = { url: result.url, title: result.title, elements: result.elements };
        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'extract_images',
    {
      title: 'Describe page images',
      description:
        'Render a web page and return its meaningful images with text descriptions (from alt text, captions, or titles). Trackers, spacers, and decorative/ad images are marked as dropped with a reason.',
      inputSchema: commonInputShape,
      outputSchema: {
        url: z.string(),
        title: z.string(),
        images: z.array(imageDescSchema),
      },
      annotations: readOnlyAnnotations,
    },
    async (common): Promise<CallToolResult> => {
      try {
        const result: PageResult = await extractPage(common.input, {
          ...toExtractOptions(common),
          describeImages: true,
        });
        const output = { url: result.url, title: result.title, images: result.images };
        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'crawl_site',
    {
      title: 'Crawl a site to Markdown',
      description:
        'Starting from a seed URL, follow in-scope links breadth-first and extract each page to clean Markdown. Returns a page list, a link graph, and (optionally) per-page Markdown. Respects robots.txt and honors depth, page-count, scope, concurrency, and include/exclude limits. The `input` must be an http(s) URL.',
      inputSchema: {
        ...commonInputShape,
        maxDepth: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe('Maximum link depth from the seed (seed = 0). Default 2'),
        maxPages: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Hard cap on pages fetched. Default 25'),
        concurrency: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Pages fetched in parallel. Default 3'),
        scope: z
          .enum(['host', 'domain', 'prefix'])
          .optional()
          .describe(
            "Link scope: 'host' (same hostname, default), 'domain' (same base domain), or 'prefix' (same origin under the seed path)",
          ),
        delayMs: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe('Politeness delay (ms) per worker between fetches. Default 0'),
        include: z
          .array(z.string())
          .optional()
          .describe('Only crawl URLs matching at least one of these regex sources'),
        exclude: z
          .array(z.string())
          .optional()
          .describe('Skip URLs matching any of these regex sources'),
        respectRobots: z
          .boolean()
          .optional()
          .describe('Fetch and honor robots.txt for the seed origin. Default true'),
        describeImages: z
          .boolean()
          .optional()
          .describe('Include text descriptions of meaningful images on each page (default false)'),
        includeMarkdown: z
          .boolean()
          .optional()
          .describe('Include each page\'s full Markdown in the result (default false; can be large)'),
      },
      outputSchema: {
        seed: z.string(),
        scope: z.enum(['host', 'domain', 'prefix']),
        stats: z.object({
          crawled: z.number().int(),
          failed: z.number().int(),
          discovered: z.number().int(),
        }),
        pages: z.array(crawlPageSchema),
        graph: z.array(crawlEdgeSchema),
      },
      annotations: readOnlyAnnotations,
    },
    async ({
      maxDepth,
      maxPages,
      concurrency,
      scope,
      delayMs,
      include,
      exclude,
      respectRobots,
      describeImages,
      includeMarkdown,
      ...common
    }): Promise<CallToolResult> => {
      try {
        const summary: CrawlSummary = await crawlSite(common.input, {
          ...toExtractOptions(common),
          maxDepth,
          maxPages: maxPages ?? 25,
          concurrency,
          scope,
          delayMs,
          include,
          exclude,
          respectRobots,
          describeImages,
        });
        const output = {
          seed: summary.seed,
          scope: summary.scope,
          stats: summary.stats,
          pages: summary.pages.map((p) => ({
            url: p.url,
            depth: p.depth,
            ok: p.ok,
            title: p.title,
            error: p.error,
            markdown: includeMarkdown && p.result ? p.result.markdown : undefined,
          })),
          graph: Object.entries(summary.graph).map(([from, to]) => ({ from, to })),
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  return server;
}
