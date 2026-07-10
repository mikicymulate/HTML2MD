/** Derive a filesystem-safe slug from a URL, file path, or raw HTML input. */
export function slugify(input: string): string {
  let base: string = input.trim();

  if (/^https?:\/\//i.test(base) || /^file:\/\//i.test(base)) {
    try {
      const u: URL = new URL(base);
      const path: string = u.pathname.replace(/\/+$/, '').replace(/^\/+/, '');
      base = [u.hostname, path].filter(Boolean).join('-');
    } catch {
      // fall through to generic cleanup
    }
  } else if (/^\s*</.test(base)) {
    base = 'inline-html';
  } else {
    // Local file path: use the base filename without extension.
    const parts: string[] = base.split(/[\\/]/);
    base = parts[parts.length - 1] || 'page';
    base = base.replace(/\.[a-z0-9]+$/i, '');
  }

  const slug: string = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return slug || 'page';
}
