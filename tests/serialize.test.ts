import { describe, it, expect } from 'vitest';
import { serializeMarkdown } from '../src/serialize/markdown';
import type { SerializeResult } from '../src/serialize/markdown';
import type { ElementNode, ImageDesc } from '../src/types';

const elements: ElementNode[] = [
  {
    ref: 'e1',
    kind: 'textfield',
    label: 'Email',
    name: 'email',
    required: true,
    selector: '#email',
    howToInteract: 'Type text into "Email"',
  },
  {
    ref: 'e2',
    kind: 'submit',
    label: 'Subscribe now',
    selector: 'button[type="submit"]',
    howToInteract: 'Submit the form using "Subscribe now"',
  },
];

const images: ImageDesc[] = [
  { src: 'https://x/y.jpg', description: 'A red widget', source: 'alt', kept: true },
  { src: 'https://x/pixel.gif', description: '', source: 'none', kept: false, reason: 'tracking-pixel' },
];

describe('serializeMarkdown', () => {
  it('emits frontmatter, content, an Images section, and an element appendix', () => {
    const { markdown, frontmatter }: SerializeResult = serializeMarkdown({
      url: 'https://example.com/',
      title: 'Widgets',
      contentHtml: '<p>Hello <strong>world</strong></p>',
      elements,
      images,
      fetchedAt: '2026-07-10T00:00:00Z',
    });

    expect(frontmatter.url).toBe('https://example.com/');
    expect(frontmatter.elementCount).toBe(2);
    expect(frontmatter.imageCount).toBe(1);

    expect(markdown.startsWith('---\n')).toBe(true);
    expect(markdown).toContain('# Widgets');
    expect(markdown).toContain('Hello **world**');
    expect(markdown).toContain('## Images');
    expect(markdown).toContain('A red widget');
    expect(markdown).toContain('## Interactive Elements');
    expect(markdown).toContain('### e1 · textfield — "Email"');
    expect(markdown).toContain('- selector: `#email`');
    // dropped image must not be rendered
    expect(markdown).not.toContain('pixel.gif');
  });
});
