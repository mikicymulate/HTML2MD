#!/usr/bin/env node
import { Command } from 'commander';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { extractPage } from './index';
import { slugify } from './util/slug';

interface CliOptions {
  out: string;
  describeImages: boolean;
  screenshot: boolean;
  headless: boolean;
  blockAds: boolean;
  timeout: string;
}

const program = new Command();

program
  .name('html2md')
  .description(
    'Turn any web page into clean, AI-consumable Markdown with an interactive-element map.',
  )
  .argument('<input>', 'URL, local HTML file path, or file:// URL')
  .option('-o, --out <dir>', 'output directory', 'out')
  .option('--describe-images', 'describe meaningful images (alt/caption based)', false)
  .option('--screenshot', 'save a full-page screenshot of the cleaned page', false)
  .option('--no-headless', 'run the browser with a visible window')
  .option('--no-block-ads', 'do not block ad/analytics network requests')
  .option('--timeout <ms>', 'navigation timeout in milliseconds', '30000')
  .action(async (input: string, opts: CliOptions) => {
    const outDir: string = resolve(opts.out, slugify(input));
    await mkdir(outDir, { recursive: true });
    const screenshotPath: string | undefined = opts.screenshot ? join(outDir, 'screenshot.png') : undefined;

    const result = await extractPage(input, {
      headless: opts.headless,
      blockAds: opts.blockAds,
      describeImages: opts.describeImages,
      timeoutMs: Number(opts.timeout),
      screenshotPath,
    });

    await writeFile(join(outDir, 'page.md'), result.markdown, 'utf8');
    await writeFile(join(outDir, 'elements.json'), JSON.stringify(result.elements, null, 2), 'utf8');
    await writeFile(join(outDir, 'images.json'), JSON.stringify(result.images, null, 2), 'utf8');

    const keptImages: number = result.images.filter((i) => i.kept).length;
    process.stdout.write(`✓ ${join(outDir, 'page.md')}\n`);
    process.stdout.write(
      `  ${result.elements.length} interactive elements, ${keptImages} images described\n`,
    );
    if (screenshotPath) process.stdout.write(`  screenshot: ${screenshotPath}\n`);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`html2md: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
