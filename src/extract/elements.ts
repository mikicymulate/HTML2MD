import type { Page } from 'playwright';
import type { ElementKind, ElementNode } from '../types';

/**
 * Raw element record produced inside the browser (or jsdom) by {@link collectInteractive}.
 * Kept JSON-serializable so it can cross the Playwright evaluate boundary.
 */
export interface RawElement {
  ref: string;
  tag: string;
  type: string | null;
  kind: ElementKind;
  label: string;
  name: string | null;
  id: string | null;
  value: string | null;
  placeholder: string | null;
  required: boolean;
  disabled: boolean;
  options: string[] | null;
  href: string | null;
  role: string | null;
  selector: string;
  box: { x: number; y: number; width: number; height: number } | null;
}

/**
 * Walk the DOM and collect interactive elements with rich metadata and a robust selector.
 *
 * IMPORTANT: this function is serialized and executed inside the browser via
 * `page.evaluate`, so it must be fully self-contained (no references to module-scope
 * identifiers) and rely only on DOM globals. It is also directly callable under jsdom in
 * unit tests when `document`/`window` are provided as globals.
 */
export function collectInteractive(opts: { maxElements: number }): RawElement[] {
  const INTERACTIVE_SELECTOR = [
    'a[href]',
    'button',
    'input',
    'textarea',
    'select',
    '[role="button"]',
    '[role="link"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="textbox"]',
    '[role="combobox"]',
    '[contenteditable="true"]',
  ].join(',');

  function esc(s: string): string {
    const g = globalThis as { CSS?: { escape?: (v: string) => string } };
    if (g.CSS && typeof g.CSS.escape === 'function') return g.CSS.escape(s);
    return s.replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c);
  }

  function attrValue(s: string): string {
    return s.replace(/(["\\])/g, '\\$1');
  }

  function isVisible(el: Element): boolean {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    return true;
  }

  function kindOf(el: Element): ElementKind {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    if (tag === 'select') return 'select';
    if (tag === 'textarea') return 'textarea';
    if (tag === 'a') return 'link';
    if (tag === 'button') {
      const t = (el.getAttribute('type') || '').toLowerCase();
      return t === 'submit' ? 'submit' : 'button';
    }
    if (tag === 'input') {
      const t = (el.getAttribute('type') || 'text').toLowerCase();
      if (t === 'checkbox') return 'checkbox';
      if (t === 'radio') return 'radio';
      if (t === 'submit' || t === 'image') return 'submit';
      if (t === 'button' || t === 'reset') return 'button';
      if (t === 'file') return 'file';
      if (t === 'hidden') return 'other';
      return 'textfield';
    }
    if (role === 'button') return 'button';
    if (role === 'link') return 'link';
    if (role === 'checkbox') return 'checkbox';
    if (role === 'radio') return 'radio';
    if (role === 'combobox') return 'select';
    if (role === 'textbox' || el.getAttribute('contenteditable') === 'true') return 'textfield';
    return 'other';
  }

  function labelFor(el: Element): string {
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();

    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const text = labelledby
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || '')
        .join(' ')
        .trim();
      if (text) return text;
    }

    const id = el.getAttribute('id');
    if (id) {
      const lbl = document.querySelector('label[for="' + esc(id) + '"]');
      const t = lbl?.textContent?.trim();
      if (t) return t;
    }

    let p: Element | null = el.parentElement;
    while (p) {
      if (p.tagName === 'LABEL') {
        const t = p.textContent?.trim();
        if (t) return t;
      }
      p = p.parentElement;
    }

    const placeholder = el.getAttribute('placeholder');
    if (placeholder && placeholder.trim()) return placeholder.trim();

    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) return text.slice(0, 120);

    const val = el.getAttribute('value');
    if (val && val.trim()) return val.trim();

    const title = el.getAttribute('title');
    if (title && title.trim()) return title.trim();

    return '';
  }

  function cssPath(el: Element): string {
    const parts: string[] = [];
    let node: Element | null = el;
    while (node && node.nodeType === 1 && node.tagName.toLowerCase() !== 'html') {
      let selector = node.tagName.toLowerCase();
      const parent: Element | null = node.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter((c) => c.tagName === node!.tagName);
        if (sameTag.length > 1) {
          selector += ':nth-of-type(' + (sameTag.indexOf(node) + 1) + ')';
        }
      }
      parts.unshift(selector);
      if (parts.length >= 6) break;
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function buildSelector(el: Element): string {
    const id = el.getAttribute('id');
    if (id && document.querySelectorAll('#' + esc(id)).length === 1) return '#' + esc(id);

    const tag = el.tagName.toLowerCase();
    const name = el.getAttribute('name');
    if (name) {
      const sel = tag + '[name="' + attrValue(name) + '"]';
      if (document.querySelectorAll(sel).length === 1) return sel;
    }

    const testid = el.getAttribute('data-testid');
    if (testid) {
      const sel = '[data-testid="' + attrValue(testid) + '"]';
      if (document.querySelectorAll(sel).length === 1) return sel;
    }

    return cssPath(el);
  }

  const seen = new Set<Element>();
  const nodes = Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR));
  const results: RawElement[] = [];
  let counter = 0;

  for (const el of nodes) {
    if (results.length >= opts.maxElements) break;
    if (seen.has(el)) continue;
    seen.add(el);

    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute('type');
    if (tag === 'input' && (type || '').toLowerCase() === 'hidden') continue;
    if (!isVisible(el)) continue;

    const kind = kindOf(el);
    if (kind === 'other') continue;

    let options: string[] | null = null;
    if (tag === 'select') {
      options = Array.from(el.querySelectorAll('option'))
        .map((o) => (o.textContent || '').replace(/\s+/g, ' ').trim())
        .filter((t) => t.length > 0);
    }

    const inputLike = tag === 'input' || tag === 'textarea' || tag === 'select';
    const rawValue = inputLike ? (el as HTMLInputElement).value : null;

    let box: RawElement['box'] = null;
    const rect = el.getBoundingClientRect();
    if (rect && (rect.width > 0 || rect.height > 0)) {
      box = {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    }

    counter += 1;
    results.push({
      ref: 'e' + counter,
      tag,
      type: type || null,
      kind,
      label: labelFor(el),
      name: el.getAttribute('name'),
      id: el.getAttribute('id'),
      value: rawValue ? String(rawValue) : null,
      placeholder: el.getAttribute('placeholder'),
      required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
      disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
      options,
      href: tag === 'a' ? el.getAttribute('href') : null,
      role: el.getAttribute('role'),
      selector: buildSelector(el),
      box,
    });
  }

  return results;
}

function howToInteract(kind: ElementKind, label: string): string {
  const name = label || 'this element';
  switch (kind) {
    case 'textfield':
      return `Type text into "${name}"`;
    case 'textarea':
      return `Type multi-line text into "${name}"`;
    case 'select':
      return `Choose one of the listed options for "${name}"`;
    case 'checkbox':
      return `Toggle the "${name}" checkbox`;
    case 'radio':
      return `Select the "${name}" radio option`;
    case 'button':
      return `Click the "${name}" button`;
    case 'submit':
      return `Submit the form using "${name}"`;
    case 'link':
      return `Follow the "${name}" link`;
    case 'file':
      return `Upload a file for "${name}"`;
    default:
      return `Interact with "${name}"`;
  }
}

/** Convert a raw browser record into a normalized {@link ElementNode}. */
export function normalizeElement(raw: RawElement): ElementNode {
  const node: ElementNode = {
    ref: raw.ref,
    kind: raw.kind,
    label: raw.label,
    selector: raw.selector,
    howToInteract: howToInteract(raw.kind, raw.label),
  };
  if (raw.name) node.name = raw.name;
  if (raw.value) node.value = raw.value;
  if (raw.placeholder) node.placeholder = raw.placeholder;
  if (raw.required) node.required = true;
  if (raw.disabled) node.disabled = true;
  if (raw.options && raw.options.length) node.options = raw.options;
  if (raw.href) node.href = raw.href;
  if (raw.role) node.role = raw.role;
  if (raw.box) node.box = raw.box;
  return node;
}

/** Map every interactive element on the live page into normalized {@link ElementNode}s. */
export async function mapElements(
  page: Page,
  options: { maxElements?: number } = {},
): Promise<ElementNode[]> {
  const raw = await page.evaluate(collectInteractive, {
    maxElements: options.maxElements ?? 500,
  });
  return raw.map(normalizeElement);
}
