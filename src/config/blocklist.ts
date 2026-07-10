/**
 * Ad / analytics / tracker blocklists.
 *
 * `AD_DOMAINS` is used at the network layer (Playwright route interception) to abort
 * requests to known ad/analytics hosts. `AD_SELECTORS` is used to strip ad, tracker,
 * cookie/consent, and non-content nodes from the live DOM before extraction.
 */

/** Hosts whose network requests are aborted. Matched by exact host or subdomain suffix. */
export const AD_DOMAINS: readonly string[] = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'google-analytics.com',
  'googletagmanager.com',
  'googletagservices.com',
  'adservice.google.com',
  'adnxs.com',
  'amazon-adsystem.com',
  'connect.facebook.net',
  'ads-twitter.com',
  'analytics.twitter.com',
  'scorecardresearch.com',
  'quantserve.com',
  'taboola.com',
  'outbrain.com',
  'criteo.com',
  'criteo.net',
  'pubmatic.com',
  'rubiconproject.com',
  'openx.net',
  'moatads.com',
  'hotjar.com',
  'mixpanel.com',
  'segment.com',
  'segment.io',
  'branch.io',
  'yandex.ru',
  'zedo.com',
];

/**
 * CSS selectors for nodes to remove from the live DOM before extraction.
 * Kept intentionally conservative to avoid deleting real content.
 */
export const AD_SELECTORS: readonly string[] = [
  // Non-content / script-ish
  'script',
  'style',
  'noscript',
  'template',
  'link[rel="stylesheet"]',
  '[hidden]',
  '[style*="display:none"]',
  '[style*="display: none"]',
  // Ads
  'ins.adsbygoogle',
  'iframe[src*="doubleclick"]',
  'iframe[src*="googlesyndication"]',
  'iframe[src*="/ads/"]',
  '[id*="google_ads" i]',
  '[id^="ad-"]',
  '[id$="-ad"]',
  '[class*="advert" i]',
  '[class*="-ads" i]',
  '[class*="ad-slot" i]',
  '[class*="ad-banner" i]',
  '[class*="sponsor" i]',
  '[data-ad]',
  '[data-ad-slot]',
  '[aria-label*="advertisement" i]',
  // Cookie / consent / GDPR banners
  '[id*="cookie" i]',
  '[class*="cookie-consent" i]',
  '[class*="cookie-banner" i]',
  '[class*="cookie-notice" i]',
  '[id*="consent" i]',
  '[class*="consent-banner" i]',
  '[class*="gdpr" i]',
  '[aria-label*="cookie" i]',
];
