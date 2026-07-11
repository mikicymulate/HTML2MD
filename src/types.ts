/**
 * Core types for html2md-ai.
 *
 * The library turns a web page (URL / local HTML file / raw HTML string) into a clean
 * Markdown document plus a machine-readable map of the page's interactive elements and
 * the meaningful images on it.
 */

export type ElementKind =
  | 'textfield'
  | 'textarea'
  | 'button'
  | 'submit'
  | 'link'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'file'
  | 'other';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A normalized interactive element the AI can point at by `ref`. */
export interface ElementNode {
  /** Stable reference in document order, e.g. "e6". */
  ref: string;
  kind: ElementKind;
  /** Resolved human-readable label (from <label>, aria-label, placeholder, text, …). */
  label: string;
  name?: string;
  value?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Available options for a <select> (or grouped radio). */
  options?: string[];
  /** Destination for links. */
  href?: string;
  /** ARIA role, when present. */
  role?: string;
  /** Robust selector used to drive the element (id > name > data-testid > css path). */
  selector: string;
  box?: BoundingBox;
  /** Plain-English hint describing how to interact with this element. */
  howToInteract: string;
}

export type ImageDescriptionSource = 'alt' | 'caption' | 'title' | 'vision' | 'none';

/** A page image plus whether it was kept and how it was described. */
export interface ImageDesc {
  src: string;
  description: string;
  source: ImageDescriptionSource;
  kept: boolean;
  width?: number;
  height?: number;
  /** When dropped, why (tracker, decorative, too-small, ad-domain, …). */
  reason?: string;
}

export interface PageResult {
  url: string;
  title: string;
  /** Full Markdown document: frontmatter + content + Images + Interactive Elements. */
  markdown: string;
  /** The content portion only (prose Markdown, no appendix). */
  content: string;
  frontmatter: Record<string, unknown>;
  elements: ElementNode[];
  images: ImageDesc[];
  screenshotPath?: string;
  fetchedAt: string;
}

/** Pluggable image captioner used when an image lacks meaningful alt text. */
export interface VisionCaptioner {
  describe(input: { src: string; contextText?: string }): Promise<string>;
}

export type WaitUntil = 'load' | 'domcontentloaded' | 'networkidle' | 'commit';

export interface ExtractOptions {
  /** Run Chromium headless. Default true. */
  headless?: boolean;
  /** Navigation timeout in milliseconds. Default 30000. */
  timeoutMs?: number;
  /** Playwright load state to wait for on goto. Default 'domcontentloaded' (+ best-effort settle). */
  waitUntil?: WaitUntil;
  viewport?: { width: number; height: number };
  userAgent?: string;
  /** Block ad/analytics network requests. Default true. */
  blockAds?: boolean;
  /** Produce image descriptions. alt/caption always; vision only if a captioner is set. Default false. */
  describeImages?: boolean;
  /** Optional captioner for images that lack meaningful alt text. */
  visionCaptioner?: VisionCaptioner;
  /** When set, capture a full-page screenshot to this path. */
  screenshotPath?: string;
  /** Embed the raw element/image JSON in the Markdown as fenced code blocks. Default false. */
  embedJson?: boolean;
  /** Extra CSS selectors to strip from the live page before extraction. */
  extraStripSelectors?: string[];
  /** Minimum rendered dimension (px) for an image to be considered meaningful. Default 64. */
  minImageSize?: number;
  /** Maximum number of interactive elements to map. Default 500. */
  maxElements?: number;
}
