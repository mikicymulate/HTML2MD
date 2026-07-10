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
  section, and an **Interactive Elements** appendix.

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
  --no-headless          run the browser with a visible window
  --no-block-ads         do not block ad/analytics network requests
  --timeout <ms>         navigation timeout in ms (default: 30000)
```

Example:

```bash
node dist/cli.js https://example.com --out out --describe-images --screenshot
# → out/example-com/page.md, elements.json, images.json, screenshot.png
```

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
