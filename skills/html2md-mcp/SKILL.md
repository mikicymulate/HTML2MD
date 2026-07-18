---
name: html2md-mcp
description: Use the html2md-ai MCP server (tools extract_page, extract_elements, extract_images, crawl_site) to turn a web page — a URL, local HTML file, file:// URL, or raw HTML string — into clean AI-consumable Markdown, a machine-readable interactive-element map, or described images, or to crawl a whole site from a seed URL and get a page list plus link graph, all returned inline to the agent without writing files. Use this skill when working through an MCP-capable client (Claude Code/Desktop, Cursor, Windsurf, VS Code Copilot, etc.) and you want the extraction result directly in the conversation.
---

# html2md-ai — MCP server

The package ships an [MCP](https://modelcontextprotocol.io) stdio server (`html2md-mcp`,
built to `dist/mcp.js`) that exposes four read-only extraction tools. Results come back
**inline** to the agent — nothing is written to disk. If the user wants files on disk
instead, use the `html2md-cli` skill.

## Prerequisites & registration (one-time)

Build the project first (`npm install && npx playwright install chromium && npm run build`),
then register the stdio server with your client. The server speaks standard MCP over stdio,
so any MCP-capable client works.

**Claude Code:**

```bash
claude mcp add html2md -- node <path-to-HTML2MD>/dist/mcp.js
```

**Standard `mcpServers` config** (Claude Desktop, Cursor, Windsurf, Cline, Gemini CLI, …):

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

**VS Code (Copilot agent mode)** uses a `servers` key with an explicit `"type": "stdio"`;
**OpenAI Codex CLI** uses `[mcp_servers.html2md]` in `~/.codex/config.toml`. On Windows use
forward slashes in the path. Reload/restart the client after editing config so the tools appear.

## Common input (accepted by every tool)

| Field                 | Type       | Default            | Meaning                                                                 |
| --------------------- | ---------- | ------------------ | ----------------------------------------------------------------------- |
| `input`               | string     | — (required)       | URL, local HTML file path, `file://` URL, **or a raw HTML string**.     |
| `timeoutMs`           | int > 0    | `30000`            | Navigation timeout in milliseconds.                                     |
| `blockAds`            | boolean    | `true`             | Block ad/analytics network requests.                                    |
| `waitUntil`           | enum       | `domcontentloaded` | Playwright load state: `load` \| `domcontentloaded` \| `networkidle` \| `commit`. |
| `extraStripSelectors` | string[]   | —                  | Extra CSS selectors to remove before extraction.                        |

## Tools

### `extract_page` → clean Markdown document
Renders the page, strips ads/trackers/cookie banners, returns a Markdown document with YAML
frontmatter, an Images section, and an Interactive Elements appendix.
Extra options: `describeImages` (bool, default `false`), `embedJson` (bool, default **`false`**
— note this differs from the CLI, where embedding is on), `maxElements` (int, default `500`).

### `extract_elements` → interactive-element map
Returns structured content `{ url, title, elements[] }`. Each element:
`ref` (stable, e.g. `"e6"`), `kind` (`textfield` \| `textarea` \| `button` \| `submit` \|
`link` \| `select` \| `checkbox` \| `radio` \| `file` \| `other`), `label`, optional
`name`/`value`/`placeholder`/`required`/`disabled`/`options`/`href`/`role`/`box`,
a robust `selector`, and a plain-English `howToInteract` hint.
Extra option: `maxElements` (int, default `500`).

### `extract_images` → described images
Returns `{ url, title, images[] }`. Each image: `src`, `description`,
`source` (`alt` \| `caption` \| `title` \| `vision` \| `none`), `kept` (bool), optional
`width`/`height`, and — for dropped images — a `reason` (tracker, decorative, too-small,
ad-domain, …). Image description is always on for this tool; no extra options.

### `crawl_site` → multi-page crawl (page list + link graph)
Starting from a seed URL, follows in-scope links **breadth-first**, extracts each page, and
returns `{ seed, scope, stats, pages[], graph[] }`. `stats` is `{ crawled, failed, discovered }`;
each `pages[]` entry is `{ url, depth, ok, title?, error?, markdown? }` (per-page `markdown` is
included only with `includeMarkdown`); `graph[]` is `{ from, to[] }` adjacency edges.
Unlike the other tools, `input` **must be an http(s) URL** (not a local file or raw HTML).
`robots.txt` is fetched and respected by default. Extra options:

| Field            | Type       | Default  | Meaning                                                                    |
| ---------------- | ---------- | -------- | -------------------------------------------------------------------------- |
| `maxDepth`       | int ≥ 0    | `2`      | Maximum link depth from the seed (seed = 0).                               |
| `maxPages`       | int > 0    | `25`     | Hard cap on pages fetched. (Note: the CLI/library default is `50`.)         |
| `concurrency`    | int > 0    | `3`      | Pages fetched in parallel.                                                  |
| `scope`          | enum       | `host`   | `host` (same hostname) \| `domain` (same base domain, incl. subdomains) \| `prefix` (same origin at/under the seed's path). |
| `delayMs`        | int ≥ 0    | `0`      | Politeness delay per worker between fetches.                               |
| `include`        | string[]   | —        | Only crawl URLs matching at least one of these regex sources.             |
| `exclude`        | string[]   | —        | Skip URLs matching any of these regex sources.                            |
| `respectRobots`  | boolean    | `true`   | Fetch and honor `robots.txt` for the seed origin.                         |
| `describeImages` | boolean    | `false`  | Describe meaningful images on each page.                                   |
| `includeMarkdown`| boolean    | `false`  | Include each page's full Markdown in the result (can be **large**).       |

## When to use which tool

- **Reading/summarizing a page, or feeding it to a model** → `extract_page`.
- **Driving the page (fill/click/select), or need controls by `ref`/`selector`** → `extract_elements`.
- **Only care about the images / their alt-text** → `extract_images`.
- **Covering a whole site/section, or mapping how pages link together** → `crawl_site`.

## Notes for Claude

- All four tools are annotated read-only (`readOnlyHint`, `openWorldHint`) — they render
  and read a page but never mutate it or write files.
- Extraction failures come back as **tool errors** (`isError: true`) with the message as
  text; the server stays up, so recover by adjusting `input`/`timeoutMs`/`waitUntil` rather
  than assuming the server crashed.
- For JS-heavy or slow pages, raise `timeoutMs` and/or set `waitUntil: "networkidle"`.
- For `crawl_site`, keep `includeMarkdown` **off** to first survey the site cheaply via the
  page list and `graph`, then pull the full text of the pages you actually need with
  `extract_page`. Start with small `maxDepth`/`maxPages` and raise them only if needed;
  use `include`/`exclude`/`scope` to keep the crawl focused and `delayMs` to stay polite.
- To trim noisy site chrome the built-in cleaner misses, pass `extraStripSelectors`.
- Vision-based image captioning is **not** available over MCP — only alt/caption/title text.
  For a custom vision captioner, use the library API (`extractPage`).
