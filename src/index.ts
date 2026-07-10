import { renderPage, safeContent } from './render/renderer';
import { sanitizeLivePage, extractContent } from './extract/clean';
import { mapElements } from './extract/elements';
import { collectImages, describeImages } from './extract/images';
import { serializeMarkdown } from './serialize/markdown';
import type { ExtractOptions, PageResult } from './types';

export type {
  ExtractOptions,
  PageResult,
  ElementNode,
  ElementKind,
  ImageDesc,
  ImageDescriptionSource,
  VisionCaptioner,
  BoundingBox,
} from './types';
export { slugify } from './util/slug';

/**
 * Turn a web page into AI-consumable Markdown plus a machine-readable element/image map.
 *
 * @param input A URL, a `file://` URL, a local HTML file path, or a raw HTML string.
 */
export async function extractPage(
  input: string,
  options: ExtractOptions = {},
): Promise<PageResult> {
  const fetchedAt = new Date().toISOString();
  const rendered = await renderPage(input, options);

  try {
    // 1. Remove ads/trackers/cookie banners/scripts from the live DOM.
    await sanitizeLivePage(rendered.page, options.extraStripSelectors ?? []);

    // 2. Optional full-page screenshot of the cleaned page.
    let screenshotPath: string | undefined;
    if (options.screenshotPath) {
      await rendered.page.screenshot({ path: options.screenshotPath, fullPage: true });
      screenshotPath = options.screenshotPath;
    }

    // 3. Extract main content, interactive elements, and image descriptions in parallel.
    const cleanedHtml = await safeContent(rendered.page);
    const [elements, rawImages] = await Promise.all([
      mapElements(rendered.page, { maxElements: options.maxElements }),
      rendered.page.evaluate(collectImages),
    ]);
    const content = extractContent(cleanedHtml, rendered.url);
    const images = await describeImages(rawImages, {
      describeImages: options.describeImages,
      visionCaptioner: options.visionCaptioner,
      minImageSize: options.minImageSize,
    });

    const title = content.title || rendered.title || '';
    const { markdown, contentMarkdown, frontmatter } = serializeMarkdown({
      url: rendered.url,
      title,
      contentHtml: content.contentHtml,
      elements,
      images,
      fetchedAt,
      byline: content.byline,
      excerpt: content.excerpt,
      screenshotPath,
    });

    return {
      url: rendered.url,
      title,
      markdown,
      content: contentMarkdown,
      frontmatter,
      elements,
      images,
      screenshotPath,
      fetchedAt,
    };
  } finally {
    await rendered.close();
  }
}
