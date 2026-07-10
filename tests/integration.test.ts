import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extractPage } from '../src/index';
import type { ElementNode, ImageDesc, ElementKind } from '../src/types';

const here: string = dirname(fileURLToPath(import.meta.url));
const fixture: string = join(here, 'fixtures', 'article.html');

describe('extractPage (integration, real Chromium)', () => {
  it('produces clean AI Markdown with an element map from a local HTML file', async () => {
    const res = await extractPage(fixture, { describeImages: true });

    // Content preserved; ads and cookie banner removed.
    expect(res.markdown).toContain('Widgets are small components');
    expect(res.markdown).not.toContain('Sponsored advertisement');
    expect(res.markdown).not.toContain('We use cookies');

    // Interactive elements mapped with correct kinds.
    const kinds: ElementKind[] = res.elements.map((e) => e.kind);
    expect(kinds).toContain('submit');
    expect(kinds).toContain('select');
    expect(kinds).toContain('checkbox');
    expect(kinds).toContain('textarea');

    const email: ElementNode | undefined = res.elements.find((e) => e.label === 'Email address');
    expect(email?.kind).toBe('textfield');
    expect(email?.required).toBe(true);

    const country: ElementNode | undefined = res.elements.find((e) => e.label === 'Country');
    expect(country?.options).toContain('United States');

    // The cookie-banner "Accept" button was stripped by sanitize.
    expect(res.elements.some((e) => e.label === 'Accept')).toBe(false);

    // Meaningful image described; tracking pixel dropped.
    const hero: ImageDesc | undefined = res.images.find((i) => i.description === 'A red widget on a workbench');
    expect(hero?.kept).toBe(true);
    const pixel: ImageDesc | undefined = res.images.find((i) => i.src.includes('pixel.gif'));
    expect(pixel?.kept).toBe(false);
  }, 60_000);
});
