import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';
import { collectInteractive, normalizeElement } from '../src/extract/elements';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, 'fixtures', 'article.html'), 'utf8');

// collectInteractive is written to run in a DOM context; provide one via jsdom globals.
const g = globalThis as unknown as Record<string, unknown>;
let dom: JSDOM;

beforeAll(() => {
  dom = new JSDOM(html, { url: 'https://example.com/' });
  g.document = dom.window.document;
  g.window = dom.window;
  g.CSS = dom.window.CSS;
});

afterAll(() => {
  delete g.document;
  delete g.window;
  delete g.CSS;
});

describe('collectInteractive', () => {
  it('maps form controls with correct kinds, labels, and metadata', () => {
    const raw = collectInteractive({ maxElements: 500 });
    const byLabel = (l: string) => raw.find((r) => r.label === l);

    const email = byLabel('Email address');
    expect(email?.kind).toBe('textfield');
    expect(email?.required).toBe(true);
    expect(email?.name).toBe('email');
    expect(email?.selector).toBe('#email');

    expect(byLabel('Full name')?.kind).toBe('textfield');
    expect(byLabel('Short bio')?.kind).toBe('textarea');

    const country = byLabel('Country');
    expect(country?.kind).toBe('select');
    expect(country?.options).toContain('United States');

    expect(byLabel('I accept the terms')?.kind).toBe('checkbox');
    expect(byLabel('Subscribe now')?.kind).toBe('submit');
  });

  it('assigns sequential refs and skips hidden inputs', () => {
    const raw = collectInteractive({ maxElements: 500 });
    expect(raw[0]?.ref).toBe('e1');
    expect(raw.every((r, i) => r.ref === 'e' + (i + 1))).toBe(true);
    expect(raw.some((r) => r.name === 'csrf')).toBe(false);
  });

  it('normalizes raw records into ElementNodes with interaction hints', () => {
    const raw = collectInteractive({ maxElements: 500 });
    const submit = raw.find((r) => r.label === 'Subscribe now');
    expect(submit).toBeDefined();
    const node = normalizeElement(submit!);
    expect(node.howToInteract).toMatch(/Submit the form/);
    expect(node.selector).toBeTruthy();
  });
});
