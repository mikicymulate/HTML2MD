---
name: html2md-cli
description: Use the html2md-ai command-line tool to turn a web page (URL, local HTML file, or file:// URL) into a clean, AI-consumable Markdown document plus a machine-readable map of interactive elements and image descriptions written to disk. Use this skill when the user wants to convert/scrape a page to Markdown from the terminal, save the output as files, capture a full-page screenshot, or batch-extract pages via shell.
---

# html2md-ai — CLI

Convert any web page into clean Markdown (`page.md`), an interactive-element map
(`elements.json`), and image descriptions (`images.json`) from the terminal.

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

The `bin` name is `html2md` (→ `dist/cli.js`). Run it one of these ways:

```bash
node dist/cli.js <input> [options]   # from the project root, most reliable
npm start -- <input> [options]       # via the "start" script
html2md <input> [options]            # only if the package is linked/installed globally
```

`<input>` is a **URL**, a **local HTML file path**, or a **`file://` URL**.

## Options

| Option                  | Default   | Effect                                                             |
| ----------------------- | --------- | ------------------------------------------------------------------ |
| `-o, --out <dir>`       | `out`     | Output directory. A per-page subfolder (slug of the input) is created inside it. |
| `--describe-images`     | off       | Add text descriptions for meaningful images (from alt/caption/title). |
| `--screenshot`          | off       | Also save a full-page `screenshot.png` of the cleaned page.        |
| `--no-embed-json`       | embed on  | Do **not** append the raw element/image JSON inside `page.md`. (Embedding is ON by default in the CLI, so `page.md` is self-contained.) |
| `--no-headless`         | headless  | Run the browser with a visible window (useful for debugging).      |
| `--no-block-ads`        | block on  | Do not block ad/analytics network requests.                        |
| `--timeout <ms>`        | `30000`   | Navigation timeout in milliseconds.                                |

## Output

For input `https://example.com` with `--out out`, the CLI writes:

```
out/example-com/
  page.md          # frontmatter + content + Images + Interactive Elements (+ embedded JSON by default)
  elements.json    # ElementNode[]  — ref, kind, label, selector, howToInteract, …
  images.json      # ImageDesc[]    — src, description, source, kept, reason, …
  screenshot.png   # only with --screenshot
```

On success it prints the `page.md` path and a count of interactive elements and described images.

## Examples

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

## Notes for Claude

- Read `page.md` for the human/agent-readable result; parse `elements.json` when you
  need to programmatically act on the page's controls (each element has a stable `ref`,
  a robust `selector`, and a `howToInteract` hint).
- The CLI intentionally exposes a small option set. Advanced knobs (`maxElements`,
  `waitUntil`, `extraStripSelectors`, custom viewport/user-agent, a pluggable vision
  captioner) are only available via the library API (`extractPage`) or, in part, the MCP server.
- Failures exit non-zero and print `html2md: <message>` to stderr — surface that message
  to the user rather than retrying blindly.
