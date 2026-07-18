# html2md-ai

Turn any web page — a URL, a local HTML file, or a raw HTML string — into a **clean,
AI-consumable Markdown document** with a machine-readable map of the page's **interactive
elements** (text fields, buttons, selects, checkboxes, links) and **text descriptions of the
meaningful images**.

Built for AI/agent workflows: strip the ads, nav, cookie banners, scripts and trackers, keep
the content and controls, and label every control with a stable `ref` an agent can act on.

## How it works

```
URL / file://  ─▶  Renderer  ─▶  Cleaner  ─┬─▶ Content → Markdown ─┐
                  (Playwright)  (strip ads)  │                      ├─▶ page.md
                                             ├─▶ Element mapper ────┤   + elements.json
                                             └─▶ Image describer ───┘   + images.json
```

- **Renderer** (`src/render`) — Playwright Chromium renders JS-heavy pages and blocks known
  ad/analytics domains at the network layer.
- **Cleaner** (`src/extract/clean.ts`) — removes ads/trackers/cookie banners/scripts from the
  live DOM, then isolates the main content with Mozilla Readability.
- **Element mapper** (`src/extract/elements.ts`) — walks the DOM to build normalized
  `ElementNode`s with `kind`, resolved label, robust selector, and an interaction hint.
- **Image describer** (`src/extract/images.ts`) — keeps meaningful images (drops trackers,
  spacers, ad-domain and decorative images) and describes them via alt/caption/title, or an
  optional pluggable vision captioner.
- **Serializer** (`src/serialize/markdown.ts`) — Turndown + GFM, YAML frontmatter, an Images
  section, and an **Interactive Elements** appendix. By default it also appends the raw
  `elements.json` / `images.json` as fenced code blocks, so a single `page.md` is fully
  self-contained for an agent (pass `--no-embed-json` to omit them).

## Install

```bash
npm install
npx playwright install chromium
npm run build
```

## CLI

The CLI has two commands: **`extract`** (a single page, the default) and **`crawl`**
(a whole site).

### `extract` — a single page

`html2md extract <input>` — or just `html2md <input>`, since `extract` is the default.

```bash
html2md <url|file> [options]

  -o, --out <dir>        output directory (default: "out")
  --describe-images      describe meaningful images (alt/caption based)
  --screenshot           save a full-page screenshot of the cleaned page
  --no-embed-json        do not embed the raw element/image JSON in page.md (on by default)
  --no-headless          run the browser with a visible window
  --no-block-ads         do not block ad/analytics network requests
  --timeout <ms>         navigation timeout in ms (default: 30000)
```

Example:

```bash
node dist/cli.js https://example.com --out out --describe-images --screenshot
# → out/example-com/page.md, elements.json, images.json, screenshot.png
```

### `crawl` — a whole site

Starting from a seed URL, follow in-scope links **breadth-first**, extract each page, and
write one folder per page plus a link-graph manifest. `robots.txt` is respected by default.

```bash
html2md crawl <url> [options]

  -o, --out <dir>        output directory (default: "out")
  --max-depth <n>        maximum link depth from the seed, seed = 0 (default: 2)
  --max-pages <n>        maximum number of pages to fetch (default: 50)
  --concurrency <n>      pages to fetch in parallel (default: 3)
  --scope <scope>        host | domain | prefix (default: host)
  --delay <ms>           politeness delay between requests per worker (default: 0)
  --include <regex...>   only crawl URLs matching at least one of these regexes
  --exclude <regex...>   skip URLs matching any of these regexes
  --no-robots            do not fetch or respect robots.txt
  --describe-images      describe meaningful images on each page
  --no-embed-json        do not embed the raw element/image JSON in each page.md
  --no-headless          run the browser with a visible window
  --no-block-ads         do not block ad/analytics network requests
  --timeout <ms>         navigation timeout in ms (default: 30000)
```

**Scope** controls how far the crawl roams from the seed:

| Scope    | Follows links to…                                                            |
| -------- | ---------------------------------------------------------------------------- |
| `host`   | the exact same hostname (default)                                            |
| `domain` | the same base domain, so subdomains are included                             |
| `prefix` | the same origin, at or under the seed's path (e.g. keep a crawl inside `/docs`) |

Example:

```bash
node dist/cli.js crawl https://example.com/docs --scope prefix --max-depth 3 --out out
# → out/example-com-docs/
#     index.md                     ← human-readable table of contents
#     crawl.json                   ← manifest: stats, per-page list, and the link graph
#     pages/<page-slug>/page.md, elements.json, images.json   ← one folder per page
```

## MCP server (use with AI coding agents)

The package ships an [MCP](https://modelcontextprotocol.io) stdio server (`html2md-mcp`,
built to `dist/mcp.js`). It speaks standard MCP over stdio, so it works with **any
MCP-capable client** — Claude Code, Claude Desktop, Google Antigravity, Cursor, Windsurf,
VS Code (Copilot), Gemini CLI, Codex CLI, Cline, and others.

In all examples below, replace `<path-to-HTML2MD>` with the absolute path to your clone of
this project, and build first (`npm run build`). On Windows, use forward slashes or escaped
backslashes inside JSON (`C:/dev/HTML2MD/...`).

### Standard config block (most clients)

Most clients share the same `mcpServers` JSON shape:

```json
{
  "mcpServers": {
    "html2md": {
      "command": "node",
      "args": ["<path-to-HTML2MD>/dist/mcp.js"]
    }
  }
}
```

Where to put it:

| Client                 | Config location                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Claude Code**        | `.mcp.json` in the project root, or run `claude mcp add html2md -- node <path-to-HTML2MD>/dist/mcp.js`                    |
| **Claude Desktop**     | `claude_desktop_config.json` (Settings → Developer → Edit Config)                                                          |
| **Google Antigravity** | `mcp_config.json` — agent panel → `…` → **MCP Servers** → **Manage MCP Servers** → **View raw config** (`~/.gemini/antigravity/mcp_config.json`) |
| **Cursor**             | `.cursor/mcp.json` in the project, or `~/.cursor/mcp.json` globally                                                        |
| **Windsurf**           | `~/.codeium/windsurf/mcp_config.json`                                                                                      |
| **Gemini CLI**         | `~/.gemini/settings.json` (add the `mcpServers` block to the existing JSON)                                                |
| **Cline**              | MCP Servers icon → **Configure MCP Servers** (`cline_mcp_settings.json`)                                                   |

### Clients with a different config format

**VS Code (GitHub Copilot agent mode)** — `.vscode/mcp.json` in the workspace uses a
`servers` key with an explicit type:

```json
{
  "servers": {
    "html2md": {
      "type": "stdio",
      "command": "node",
      "args": ["<path-to-HTML2MD>/dist/mcp.js"]
    }
  }
}
```

**OpenAI Codex CLI** — `~/.codex/config.toml` uses TOML:

```toml
[mcp_servers.html2md]
command = "node"
args = ["<path-to-HTML2MD>/dist/mcp.js"]
```

After editing the config, restart or reload the client — the tools below then show up
under the `html2md` server.

Tools exposed (all accept a URL, local HTML file path, `file://` URL, or raw HTML string
as `input`, plus `timeoutMs`, `blockAds`, `waitUntil`, `extraStripSelectors`):

| Tool               | Returns                                                                  |
| ------------------ | ------------------------------------------------------------------------ |
| `extract_page`     | The full clean Markdown document (options: `describeImages`, `embedJson`, `maxElements`) |
| `extract_elements` | Structured interactive-element map (`ref`, `kind`, `label`, `selector`, hints) |
| `extract_images`   | Meaningful images with text descriptions; dropped images include a reason |
| `crawl_site`       | Crawls in-scope links from a seed URL; returns a page list, the link graph, and (with `includeMarkdown`) each page's Markdown. Options: `maxDepth`, `maxPages`, `concurrency`, `scope`, `delayMs`, `include`, `exclude`, `respectRobots`, `describeImages`, `includeMarkdown` |

Extraction failures are reported as tool errors (`isError`), so agents can recover
without the server crashing.

## Library

```ts
import { extractPage } from 'html2md-ai';

const result = await extractPage('https://example.com', { describeImages: true });
console.log(result.markdown);   // full AI Markdown document
console.log(result.elements);   // ElementNode[] — the interactive-element map
console.log(result.images);     // ImageDesc[]  — kept/dropped images + descriptions
```

### Crawling a site

```ts
import { crawlSite } from 'html2md-ai';

const summary = await crawlSite('https://example.com/docs', {
  scope: 'prefix',   // 'host' | 'domain' | 'prefix'
  maxDepth: 3,
  maxPages: 100,
  concurrency: 3,
  respectRobots: true,
  onPage: (p) => console.log(`${p.ok ? '✓' : '✗'} [d${p.depth}] ${p.url}`),
});

console.log(summary.stats);      // { crawled, failed, discovered }
console.log(summary.graph);      // Record<url, url[]> — the in-scope link graph
for (const page of summary.pages) {
  if (page.ok) console.log(page.url, page.result!.markdown.length);
}
```

### Custom vision captioner

Provide any object implementing `VisionCaptioner` to describe images that lack alt text:

```ts
const result = await extractPage(url, {
  describeImages: true,
  visionCaptioner: {
    async describe({ src }) {
      // call Claude API vision, a local LM Studio model, etc.
      return 'a short description';
    },
  },
});
```

## Development

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest (unit + real-Chromium integration)
npm run build       # tsup → dist/
```

## Roadmap

- ✅ **Multi-page crawling:** `crawl` command / `crawlSite` API / `crawl_site` MCP tool —
  breadth-first crawl with depth/page/concurrency caps, host/domain/prefix scope,
  include/exclude filters, robots.txt respect, and a link-graph manifest.
- **Phase 2 — Flow engine:** declarative fill/select/click/navigate steps that re-extract
  Markdown at each step, producing a chain an AI can follow, plus a run manifest.
- **Phase 3 — Polish:** config file, blocklist tuning, retries, polite-crawl options.

See [`plan/html2md-ai.md`](plan/html2md-ai.md) for the full plan.
