import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import YAML from 'yaml';
import type { ElementNode, ImageDesc } from '../types';

export interface SerializeInput {
  url: string;
  title: string;
  contentHtml: string;
  elements: ElementNode[];
  images: ImageDesc[];
  fetchedAt: string;
  byline?: string | null;
  excerpt?: string | null;
  screenshotPath?: string;
}

export interface SerializeResult {
  markdown: string;
  contentMarkdown: string;
  frontmatter: Record<string, unknown>;
}

function createTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    hr: '---',
    linkStyle: 'inlined',
    emDelimiter: '_',
  });
  td.use(gfm);
  td.remove(['script', 'style', 'noscript', 'iframe']);
  return td;
}

function renderFrontmatter(obj: Record<string, unknown>): string {
  return `---\n${YAML.stringify(obj).trimEnd()}\n---\n`;
}

/** One `_`-escaped inline string safe to drop inside markdown emphasis/link text. */
function inline(text: string): string {
  return text.replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').trim();
}

function renderElement(el: ElementNode): string {
  const heading = `### ${el.ref} · ${el.kind}${el.label ? ` — "${inline(el.label)}"` : ''}`;
  const lines = [heading];
  if (el.name) lines.push(`- name: \`${el.name}\``);
  if (el.value) lines.push(`- value: ${inline(el.value)}`);
  if (el.placeholder) lines.push(`- placeholder: ${inline(el.placeholder)}`);
  if (el.required) lines.push('- required: true');
  if (el.disabled) lines.push('- disabled: true');
  if (el.options?.length) {
    lines.push(`- options: ${el.options.map((o) => `\`${inline(o)}\``).join(', ')}`);
  }
  if (el.href) lines.push(`- href: ${el.href}`);
  lines.push(`- selector: \`${el.selector}\``);
  lines.push(`- action: ${el.howToInteract}`);
  return lines.join('\n');
}

/**
 * Assemble the final Markdown document: YAML frontmatter, the cleaned content, an Images
 * section (descriptions of the meaningful images), and an Interactive Elements appendix.
 */
export function serializeMarkdown(input: SerializeInput): SerializeResult {
  const td = createTurndown();
  const contentMarkdown = td.turndown(input.contentHtml || '').trim();

  const keptImages = input.images.filter((i) => i.kept && i.description);

  const frontmatter: Record<string, unknown> = {
    url: input.url,
    title: input.title,
    fetchedAt: input.fetchedAt,
    elementCount: input.elements.length,
    imageCount: keptImages.length,
  };
  if (input.byline) frontmatter.byline = input.byline;
  if (input.excerpt) frontmatter.excerpt = inline(input.excerpt);
  if (input.screenshotPath) frontmatter.screenshot = input.screenshotPath;

  const parts: string[] = [renderFrontmatter(frontmatter), `# ${input.title || 'Untitled'}`, ''];
  if (contentMarkdown) parts.push(contentMarkdown, '');

  if (keptImages.length) {
    parts.push('## Images', '');
    for (const img of keptImages) {
      parts.push(
        `- ![${inline(img.description)}](${img.src}) — _${inline(img.description)}_ (source: ${img.source})`,
      );
    }
    parts.push('');
  }

  if (input.elements.length) {
    parts.push('## Interactive Elements', '');
    parts.push('> Reference elements by their `ref` to fill, select, check, or click them.', '');
    for (const el of input.elements) {
      parts.push(renderElement(el), '');
    }
  }

  const markdown = parts.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  return { markdown, contentMarkdown, frontmatter };
}
