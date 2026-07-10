import { test, expect } from '@playwright/test';
import { describeImages, type RawImage } from '../src/extract/images';

function img(partial: Partial<RawImage>): RawImage {
  return {
    src: 'https://cdn.example.com/x.png',
    alt: '',
    title: '',
    figcaption: '',
    width: 300,
    height: 200,
    role: '',
    ariaHidden: false,
    ...partial,
  };
}

test.describe('describeImages', () => {
  test('keeps images with meaningful alt text', async () => {
    const [d] = await describeImages([img({ alt: 'A red widget on a workbench' })]);
    expect(d?.kept).toBe(true);
    expect(d?.source).toBe('alt');
    expect(d?.description).toBe('A red widget on a workbench');
  });

  test('falls back to figcaption when alt is missing', async () => {
    const [d] = await describeImages([img({ alt: '', figcaption: 'A labelled diagram' })]);
    expect(d?.source).toBe('caption');
    expect(d?.kept).toBe(true);
  });

  test('drops tracking pixels, tiny icons, and ad-domain images', async () => {
    const res = await describeImages(
      [
        img({ width: 1, height: 1 }),
        img({ width: 16, height: 16 }),
        img({ src: 'https://doubleclick.net/ad.png', width: 300, height: 250 }),
      ],
      { minImageSize: 64 },
    );
    expect(res[0]?.kept).toBe(false);
    expect(res[0]?.reason).toBe('tracking-pixel');
    expect(res[1]?.kept).toBe(false);
    expect(res[1]?.reason).toBe('too-small');
    expect(res[2]?.kept).toBe(false);
    expect(res[2]?.reason).toBe('ad-domain');
  });

  test('uses the vision captioner when no text description exists', async () => {
    const captioner = { describe: async () => 'A generated caption' };
    const [d] = await describeImages([img({ alt: '' })], {
      describeImages: true,
      visionCaptioner: captioner,
    });
    expect(d?.source).toBe('vision');
    expect(d?.description).toBe('A generated caption');
  });
});
