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

## MCP server (use with AI coding agents)

The package ships an [MCP](https://modelcontextprotocol.io) stdio server (`html2md-mcp`,
built to `dist/mcp.js`) so agents like Claude Code, Cursor, or Windsurf can extract pages
as a tool call.

Register with Claude Code:

```bash
claude mcp add html2md -- node C:/dev/AI/HTML2MD/dist/mcp.js
```

Or add to a `.mcp.json` / MCP client config:

```json
{
  "mcpServers": {
    "html2md": {
      "command": "node",
      "args": ["C:/dev/AI/HTML2MD/dist/mcp.js"]
    }
  }
}
```

Tools exposed (all accept a URL, local HTML file path, `file://` URL, or raw HTML string
as `input`, plus `timeoutMs`, `blockAds`, `waitUntil`, `extraStripSelectors`):

| Tool               | Returns                                                                  |
| ------------------ | ------------------------------------------------------------------------ |
| `extract_page`     | The full clean Markdown document (options: `describeImages`, `embedJson`, `maxElements`) |
| `extract_elements` | Structured interactive-element map (`ref`, `kind`, `label`, `selector`, hints) |
| `extract_images`   | Meaningful images with text descriptions; dropped images include a reason |

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

- **Phase 2 — Flow engine:** declarative fill/select/click/navigate steps that re-extract
  Markdown at each step, producing a chain an AI can follow, plus a run manifest.
- **Phase 3 — Polish:** config file, blocklist tuning, retries, polite-crawl options.

See [`plan/html2md-ai.md`](plan/html2md-ai.md) for the full plan.
