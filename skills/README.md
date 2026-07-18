# Skills

Agent Skills that teach an AI assistant how to use html2md-ai's two interfaces. Each skill
is a folder with a `SKILL.md` (YAML frontmatter + instructions) that a Claude Code / Agent
Skills–compatible client can discover and load on demand.

| Skill                                    | Interface                | Use when…                                                        |
| ---------------------------------------- | ------------------------ | ---------------------------------------------------------------- |
| [`html2md-cli`](html2md-cli/SKILL.md)    | `html2md` command line   | You want the extraction written to disk (`page.md` + JSON) from a shell — for a single page (`extract`) or a whole site (`crawl`). |
| [`html2md-mcp`](html2md-mcp/SKILL.md)    | `html2md-mcp` MCP server | You want the result inline in the conversation via an MCP-capable client (tools `extract_page`, `extract_elements`, `extract_images`, `crawl_site`). |

Both wrap the same engine — `extractPage` for a single page and `crawlSite` for a
multi-page crawl; the choice of skill is only about where the output goes.
Build the project first (`npm install && npx playwright install chromium && npm run build`).
