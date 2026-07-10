import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extractContent } from '../src/extract/clean';

const here: string = dirname(fileURLToPath(import.meta.url));
const html: string = readFileSync(join(here, 'fixtures', 'article.html'), 'utf8');

describe('extractContent', () => {
  it('extracts the main article text and title via Readability', () => {
    const content = extractContent(html, 'https://example.com/article');
    expect(content.title).toContain('Widgets');
    expect(content.textContent).toContain('Widgets are small components');
    expect(content.usedReadability).toBe(true);
  });
});
