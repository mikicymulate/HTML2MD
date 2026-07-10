# Plan: HTML2MD-AI — Web Page → AI-Consumable Markdown

> This is the approved implementation plan, copied into the repo per the original request.
> Canonical source: `C:\Users\bugx0\.claude\plans\create-a-plan-for-magical-wadler.md`.

## Context

We are building a TypeScript tool that turns any web page (URL) — or local HTML file —
into a clean Markdown document optimized for an AI/LLM to read and act on. Raw HTML is
noisy (ads, nav, scripts, trackers) and hides *what an element does*. An AI agent that
needs to read a page, understand its controls, and drive a multi-step flow (fill a form,
click a button, land on the next page, repeat) needs:

1. **Clean content** — main text with ads/boilerplate/trackers stripped.
2. **An interactive-element map** — every text field, button, select, checkbox, link, etc.
   labeled with a stable reference the AI can point at ("fill ref e6", "click ref e5").
3. **Image understanding** — short *text descriptions* of the meaningful images (not the
   decorative/ad/tracking ones), embedded in the Markdown.
4. **Flow replay** (later phase) — a way to record/define "fill these fields, click this,
   go to the next URL" and re-extract Markdown at each step, producing a chain the AI can
   follow.

The intended outcome: point the tool at a URL and get back a Markdown file (plus a machine-
readable element map) that an AI can fully understand and continue working on.

### Decisions confirmed with the user
- **Interface:** both a reusable TypeScript **library core** and a thin **CLI** on top.
- **v1 scope:** **single-page extraction first**. The multi-step flow engine is **Phase 2**.
- **Content policy:** **remove** ads, nav, cookie/consent banners, scripts, trackers;
  **keep** the main content **and** all interactive controls.
- **"Picture" feature:** save **text descriptions of the necessary images only** (alt text
  where present, optional vision caption otherwise; skip decorative/ad/tracking images).
  Full-page screenshot is an optional secondary artifact.

## Architecture

```
URL / file://  ─▶  Renderer  ─▶  Cleaner  ─┬─▶ Content→Markdown ─┐
                  (Playwright)  (strip ads)  │                    ├─▶ Serializer ─▶ page.md
                                             ├─▶ Element mapper ──┤   (+ frontmatter,
                                             └─▶ Image describer ─┘    element appendix)
                                                                       + elements.json
```

### Modules (v1)
- `src/render/renderer.ts` — Playwright Chromium; load URL/file://; wait for stability;
  block ad/analytics domains; return live Page + rendered HTML.
- `src/extract/clean.ts` — strip scripts/styles/hidden/ads/cookie-banners via configurable
  blocklist, then Readability to isolate main content HTML.
- `src/extract/elements.ts` — `page.ariaSnapshot({ mode: 'ai', boxes: true })` + DOM evaluate
  pass → normalized `ElementNode[]` (kind, label, selector, metadata).
- `src/extract/images.ts` — collect images, filter trackers/decorative/ads, describe via
  alt/caption with optional pluggable vision captioner.
- `src/serialize/markdown.ts` — Turndown + GFM, custom inline element markers, YAML
  frontmatter, "Interactive Elements" appendix.
- `src/cli.ts` — commander CLI `html2md <url>`.
- `src/index.ts` — library API `extractPage(input, options)`.

### Phase 2 — flow engine
- `src/flow/spec.ts` — declarative flow (YAML/JSON), zod-validated steps.
- `src/flow/runner.ts` — execute steps against the live page; re-extract per step; manifest.

## Tech stack
Node 20+, TypeScript (ESM), tsup build, vitest tests. Deps: playwright,
@mozilla/readability, jsdom, turndown, turndown-plugin-gfm, commander, zod, yaml.

## Milestones
- Phase 0 — Scaffold (this).
- Phase 1 — Single-page extraction (primary deliverable).
- Phase 2 — Flow engine.
- Phase 3 — Polish (config, blocklist tuning, retries, docs).

## Verification
- Vitest unit tests over fixture HTML (cleaner, elements, serializer, images).
- Integration test on a local fixture page (article + form + ad + tracker + images).
- Manual smoke: `html2md https://example.com --out ./out`.
