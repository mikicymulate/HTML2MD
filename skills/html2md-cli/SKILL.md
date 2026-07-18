---
name: html2md-cli
description: Use the html2md-ai command-line tool to turn a web page — or a whole site — into clean, AI-consumable Markdown plus a machine-readable map of interactive elements and image descriptions written to disk. The `extract` command converts a single page (URL, local HTML file, or file:// URL); the `crawl` command follows in-scope links breadth-first from a seed URL and writes one folder per page plus a link-graph manifest. Use this skill when the user wants to convert/scrape a page or crawl a site to Markdown from the terminal, save the output as files, capture a full-page screenshot, or batch-extract pages via shell.
---

# html2md-ai — CLI

Convert any web page into clean Markdown (`page.md`), an interactive-element map
(`elements.json`), and image descriptions (`images.json`) from the terminal — for a
**single page** (`extract`) or an **entire site** (`crawl`).

Use this skill when the work happens on disk / in a shell. If you need the result
**inline in the conversation** (no files written), use the `html2md-mcp` skill instead.

## Prerequisites (one-time)

The CLI runs from the built output, so the project must be built once:

```bash
npm install
npx playwright install chromium   # downloads the headless browser
npm run build                     # produces dist/cli.js
```

## Invoking

The `bin` name is `html2md` (→ `dist/cli.js`). It has two subcommands:

- **`extract <input>`** — one page. This is the **default**, so `html2md <input>` ≡ `html2md extract <input>`.
- **`crawl <url>`** — a whole site, following in-scope links from a seed URL.

Run it one of these ways:

```bash
node dist/cli.js <input> [options]          # from the project root, most reliable
node dist/cli.js crawl <url> [options]      # the crawl subcommand
npm start -- <input> [options]              # via the "start" script
html2md <input> [options]                   # only if the package is linked/installed globally
```

For `extract`, `<input>` is a **URL**, a **local HTML file path**, or a **`file://` URL**.
For `crawl`, the seed must be an **http(s) URL**.

## `extract` — a single page

### Options

| Option                  | Default   | Effect                                                             |
| ----------------------- | --------- | ------------------------------------------------------------------ |
| `-o, --out <dir>`       | `out`     | Output directory. A per-page subfolder (slug of the input) is created inside it. |
| `--describe-images`     | off       | Add text descriptions for meaningful images (from alt/caption/title). |
| `--screenshot`          | off       | Also save a full-page `screenshot.png` of the cleaned page.        |
| `--no-embed-json`       | embed on  | Do **not** append the raw element/image JSON inside `page.md`. (Embedding is ON by default in the CLI, so `page.md` is self-contained.) |
| `--no-headless`         | headless  | Run the browser with a visible window (useful for debugging).      |
| `--no-block-ads`        | block on  | Do not block ad/analytics network requests.                        |
| `--timeout <ms>`        | `30000`   | Navigation timeout in milliseconds.                                |

### Output

For input `https://example.com` with `--out out`, the CLI writes:

```
out/example-com/
  page.md          # frontmatter + content + Images + Interactive Elements (+ embedded JSON by default)
  elements.json    # ElementNode[]  — ref, kind, label, selector, howToInteract, …
  images.json      # ImageDesc[]    — src, description, source, kept, reason, …
  screenshot.png   # only with --screenshot
```

On success it prints the `page.md` path and a count of interactive elements and described images.

### Examples

```bash
# Simplest: clean Markdown for a URL → out/example-com/page.md
node dist/cli.js https://example.com

# Full extraction with images + screenshot into a custom directory
node dist/cli.js https://example.com --out ./exports --describe-images --screenshot

# A local HTML file, keeping page.md free of the embedded JSON blocks
node dist/cli.js ./fixtures/report.html --no-embed-json

# Debug a stubborn/JS-heavy page with a visible browser and longer timeout
node dist/cli.js https://slow.example --no-headless --timeout 60000
```

## `crawl` — a whole site

Starting from a seed URL, `crawl` follows in-scope links **breadth-first**, runs the same
single-page extraction on each page, and writes one folder per page plus a link-graph
manifest. `robots.txt` is fetched and respected by default, and depth, page count,
concurrency, and scope are all bounded.

### Options

| Option                  | Default | Effect                                                                      |
| ----------------------- | ------- | --------------------------------------------------------------------------- |
| `-o, --out <dir>`       | `out`   | Output directory. A per-seed subfolder (slug of the seed URL) is created inside it. |
| `--max-depth <n>`       | `2`     | Maximum link depth from the seed (seed = depth 0).                          |
| `--max-pages <n>`       | `50`    | Hard cap on the number of pages fetched.                                    |
| `--concurrency <n>`     | `3`     | Number of pages to fetch in parallel.                                       |
| `--scope <scope>`       | `host`  | How far to roam: `host` \| `domain` \| `prefix` (see table below).          |
| `--delay <ms>`          | `0`     | Politeness delay applied per worker after each fetch.                       |
| `--include <regex...>`  | —       | Only crawl URLs matching at least one of these regexes.                     |
| `--exclude <regex...>`  | —       | Skip URLs matching any of these regexes.                                    |
| `--no-robots`           | respect | Do **not** fetch or respect `robots.txt` (it is respected by default).      |
| `--describe-images`     | off     | Describe meaningful images on each page.                                    |
| `--no-embed-json`       | embed on| Do **not** embed the raw element/image JSON in each page's `page.md`.       |
| `--no-headless`         | headless| Run the browser with a visible window.                                      |
| `--no-block-ads`        | block on| Do not block ad/analytics network requests.                                 |
| `--timeout <ms>`        | `30000` | Navigation timeout in milliseconds (also used for the robots.txt fetch).    |

**Scope** controls how far the crawl roams from the seed:

| Scope    | Follows links to…                                                              |
| -------- | ------------------------------------------------------------------------------ |
| `host`   | the exact same hostname (default).                                             |
| `domain` | the same base domain, so subdomains are included.                              |
| `prefix` | the same origin, at or under the seed's path (e.g. keep a crawl inside `/docs`). |

### Output

For a seed `https://example.com/docs` with `--out out`, the CLI writes:

```
out/example-com-docs/
  index.md                       # human-readable table of contents (one link per crawled page)
  crawl.json                     # manifest: seed, scope, timing, stats, per-page list, and the link graph
  pages/<page-slug>/
    page.md                      # same layout as a single extract
    elements.json
    images.json
```

`crawl.json` carries `stats` (`crawled`, `failed`, `discovered`), the `pages` list (with each
page's `url`, `depth`, `ok`/`error`, `title`, and output `dir`), and `graph` — an adjacency
list mapping each page URL to the in-scope URLs it links to. As pages finish, a progress line
(`✓ [d1] https://…`) is printed per page; failures show `✗ … — <error>` but do not stop the crawl.

### Examples

```bash
# Crawl same-host links two levels deep (defaults) → out/example-com/index.md
node dist/cli.js crawl https://example.com

# Stay inside a docs section, go 3 levels deep, cap the size, be polite
node dist/cli.js crawl https://example.com/docs \
  --scope prefix --max-depth 3 --max-pages 100 --delay 500

# Only blog posts, skip tag/author pages, include image descriptions
node dist/cli.js crawl https://example.com \
  --include "/blog/" --exclude "/tag/" "/author/" --describe-images
```

## Notes for Claude

- Read `page.md` for the human/agent-readable result; parse `elements.json` when you
  need to programmatically act on the page's controls (each element has a stable `ref`,
  a robust `selector`, and a `howToInteract` hint).
- For a crawl, start from `index.md` (the table of contents) and use `crawl.json` when you
  need the machine-readable page list, stats, or link graph.
- Prefer `crawl` over calling `extract` in a shell loop: it dedupes URLs, respects
  `robots.txt`, bounds depth/pages/concurrency, and records the link graph for you.
- The CLI intentionally exposes a small option set. Advanced knobs (`maxElements`,
  `waitUntil`, `extraStripSelectors`, custom viewport/user-agent, a pluggable vision
  captioner) are only available via the library API (`extractPage` / `crawlSite`) or, in
  part, the MCP server.
- Failures exit non-zero and print `html2md: <message>` to stderr — surface that message
  to the user rather than retrying blindly.
