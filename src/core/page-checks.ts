import type { FetchedFile, PageFacts, PageSnapshot } from './types';
import type { Outcome } from './outcome';
import { skip } from './outcome';

const HSTS_MIN_SECONDS = 15_552_000; // 180 days

function shorten(list: string[], max = 3): string {
  const shown = list.slice(0, max).map((u) => (u.length > 80 ? `${u.slice(0, 77)}...` : u));
  return shown.join(', ') + (list.length > max ? ` and ${list.length - max} more` : '');
}

function cspDirective(csp: string, name: string): string | null {
  for (const part of csp.split(';')) {
    const [key, ...values] = part.trim().split(/\s+/);
    if (key?.toLowerCase() === name) return values.join(' ');
  }
  return null;
}

function looksLikeHtml(file: FetchedFile & { ok: true }): boolean {
  return /html/i.test(file.contentType) || /^\s*<(!doctype|html)/i.test(file.text.slice(0, 100));
}

// ---------------------------------------------------------------- headers

export function checkHttps(url: URL): Outcome {
  if (url.protocol === 'https:') return { status: 'pass', why: 'The page is served over https://.' };
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    return { status: 'warn', why: `This is a local dev server (${url.origin}). Run the check again on the deployed HTTPS URL.` };
  }
  return { status: 'fail', why: `The page is served over plain HTTP (${url.origin}).` };
}

export function checkHsts(headers: Record<string, string>, url: URL): Outcome {
  if (url.protocol !== 'https:') return skip('Skipped: HSTS only applies to HTTPS responses.');
  const value = headers['strict-transport-security'];
  if (!value) return { status: 'fail', why: 'No Strict-Transport-Security header.' };
  const maxAge = Number(/max-age\s*=\s*"?(\d+)/i.exec(value)?.[1] ?? NaN);
  if (!Number.isFinite(maxAge)) return { status: 'fail', why: `HSTS header has no valid max-age: "${value}".` };
  if (maxAge < HSTS_MIN_SECONDS) {
    return { status: 'warn', why: `HSTS max-age is ${maxAge} seconds (under 180 days).`, fix: 'Raise max-age to at least 15552000 (one year, 31536000, is common).' };
  }
  return { status: 'pass', why: `HSTS max-age is ${maxAge} seconds.` };
}

export function checkCsp(headers: Record<string, string>): Outcome {
  const csp = headers['content-security-policy'];
  if (!csp) {
    return headers['content-security-policy-report-only']
      ? { status: 'warn', why: 'Only Content-Security-Policy-Report-Only is set, so nothing is enforced yet.', fix: 'Once the reports are clean, send the same policy as Content-Security-Policy.' }
      : { status: 'fail', why: 'No Content-Security-Policy header.' };
  }
  const scriptSrc = cspDirective(csp, 'script-src') ?? cspDirective(csp, 'default-src');
  if (scriptSrc === null) {
    return { status: 'warn', why: 'The CSP has neither script-src nor default-src, so scripts are not restricted.', fix: "Add `default-src 'self'` (or a script-src) to the policy." };
  }
  if (scriptSrc.includes("'unsafe-inline'") && !/'nonce-|'sha(256|384|512)-|'strict-dynamic'/.test(scriptSrc)) {
    return { status: 'warn', why: "The CSP allows 'unsafe-inline' scripts without a nonce or hash, which lets most XSS through.", fix: "Replace 'unsafe-inline' with per-request nonces or script hashes." };
  }
  return { status: 'pass', why: 'A Content-Security-Policy restricts scripts.' };
}

export function checkFrameProtection(headers: Record<string, string>): Outcome {
  const xfo = headers['x-frame-options']?.trim().toUpperCase();
  const csp = headers['content-security-policy'];
  const ancestors = csp ? cspDirective(csp, 'frame-ancestors') : null;
  if (ancestors !== null) {
    return ancestors.split(/\s+/).includes('*')
      ? { status: 'fail', why: 'CSP frame-ancestors allows every site (*).' }
      : { status: 'pass', why: `CSP frame-ancestors: ${ancestors || "'none'"}.` };
  }
  if (xfo === 'DENY' || xfo === 'SAMEORIGIN') return { status: 'pass', why: `X-Frame-Options: ${xfo}.` };
  if (xfo) return { status: 'warn', why: `X-Frame-Options has an unsupported value: "${xfo}".` };
  return { status: 'fail', why: 'Neither X-Frame-Options nor CSP frame-ancestors is set.' };
}

export function checkNosniff(headers: Record<string, string>): Outcome {
  return headers['x-content-type-options']?.trim().toLowerCase() === 'nosniff'
    ? { status: 'pass', why: 'X-Content-Type-Options: nosniff is set.' }
    : { status: 'fail', why: 'X-Content-Type-Options: nosniff is missing.' };
}

export function checkReferrerPolicy(headers: Record<string, string>): Outcome {
  const value = headers['referrer-policy']?.trim().toLowerCase();
  if (!value) return { status: 'warn', why: 'No Referrer-Policy header (modern browsers fall back to strict-origin-when-cross-origin, older ones send full URLs).' };
  if (value.split(',').map((v) => v.trim()).includes('unsafe-url')) {
    return { status: 'fail', why: 'Referrer-Policy is unsafe-url, so full URLs go to every linked site.' };
  }
  return { status: 'pass', why: `Referrer-Policy: ${value}.` };
}

// ---------------------------------------------------------------- page content

export function checkMixedContent(page: PageFacts, url: URL): Outcome {
  if (url.protocol !== 'https:') return skip('Skipped: mixed content only matters on HTTPS pages.');
  if (page.activeInsecure.length > 0) {
    return { status: 'fail', why: `${page.activeInsecure.length} script, style, frame, request or form URL(s) use http://: ${shorten(page.activeInsecure)}` };
  }
  if (page.passiveInsecure.length > 0) {
    return { status: 'warn', why: `${page.passiveInsecure.length} image or media URL(s) use http://: ${shorten(page.passiveInsecure)}` };
  }
  return { status: 'pass', why: 'Nothing on the page loads over http://.' };
}

export function checkTitle(page: PageFacts): Outcome {
  if (!page.title) return { status: 'fail', why: 'The page has no <title>.' };
  const n = page.title.length;
  if (n < 10 || n > 70) return { status: 'warn', why: `The title is ${n} characters ("${page.title.slice(0, 80)}"). 10-70 fits search results.`, fix: 'Rewrite the title to 10-70 characters, with the most important words first.' };
  return { status: 'pass', why: `"${page.title}" (${n} characters).` };
}

export function checkDescription(page: PageFacts): Outcome {
  if (!page.description) return { status: 'fail', why: 'No meta description.' };
  const n = page.description.length;
  if (n < 50 || n > 160) {
    return {
      status: 'warn',
      why: `The meta description is ${n} characters. 50-160 shows best in results.`,
      fix: n < 50 ? 'Expand the description to 50-160 characters: what the page offers and why to click.' : 'Shorten the description to 160 characters or less; search engines cut the rest.',
    };
  }
  return { status: 'pass', why: `Meta description is ${n} characters.` };
}

export function checkCanonical(page: PageFacts, url: URL): Outcome {
  if (!page.canonical) return { status: 'warn', why: 'No <link rel="canonical">.' };
  let target: URL;
  try {
    target = new URL(page.canonical, url);
  } catch {
    return { status: 'fail', why: `The canonical URL is not valid: "${page.canonical.slice(0, 100)}".` };
  }
  if (!/^https?:\/\//i.test(page.canonical)) {
    return { status: 'warn', why: `The canonical URL is relative ("${page.canonical}").`, fix: `Use the absolute URL: <link rel="canonical" href="${target.toString()}">` };
  }
  if (target.hostname !== url.hostname) {
    return { status: 'warn', why: `The canonical points to another host (${target.hostname}). Fine for syndicated pages, a bug on most sites (often a leftover from a template or staging).` };
  }
  return { status: 'pass', why: `Canonical: ${target.toString()}` };
}

export function checkOpenGraph(page: PageFacts): Outcome {
  const missing = (['title', 'description', 'image'] as const).filter((k) => !page.og[k]).map((k) => `og:${k}`);
  if (missing.length === 3) return { status: 'fail', why: 'No Open Graph tags, so shared links get no preview.' };
  if (missing.length > 0) return { status: 'warn', why: `Missing ${missing.join(', ')}.` };
  if (!/^https?:\/\//i.test(page.og.image ?? '')) {
    return { status: 'warn', why: `og:image is relative ("${page.og.image}"). Most apps need an absolute URL.`, fix: 'Use an absolute https:// URL for og:image.' };
  }
  return { status: 'pass', why: 'og:title, og:description and og:image are set.' };
}

export function checkTwitterCard(page: PageFacts): Outcome {
  return page.twitterCard ? { status: 'pass', why: `twitter:card is ${page.twitterCard}.` } : { status: 'warn', why: 'No twitter:card meta tag.' };
}

export function checkLang(page: PageFacts): Outcome {
  return page.lang ? { status: 'pass', why: `<html lang="${page.lang}">.` } : { status: 'fail', why: 'The <html> element has no lang attribute.' };
}

export function checkViewport(page: PageFacts): Outcome {
  if (!page.viewport) return { status: 'fail', why: 'No viewport meta tag.' };
  if (!/width\s*=\s*device-width/i.test(page.viewport)) return { status: 'warn', why: `The viewport is "${page.viewport}", without width=device-width.` };
  if (/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(page.viewport)) {
    return { status: 'warn', why: 'The viewport blocks pinch-zoom, which hurts people with low vision.', fix: 'Remove user-scalable=no and maximum-scale=1.' };
  }
  return { status: 'pass', why: `Viewport: ${page.viewport}.` };
}

// ---------------------------------------------------------------- site files

/** True when the `User-agent: *` group has `Disallow: /`. */
export function robotsBlocksAll(text: string): boolean {
  let inStar = false;
  let groupHasRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const match = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!match) continue;
    const key = (match[1] ?? '').toLowerCase();
    const value = (match[2] ?? '').trim();
    if (key === 'user-agent') {
      if (groupHasRules) inStar = false;
      groupHasRules = false;
      if (value === '*') inStar = true;
      continue;
    }
    groupHasRules = true;
    if (inStar && key === 'disallow' && value === '/') return true;
  }
  return false;
}

export function checkRobots(robots: FetchedFile): Outcome {
  if (!robots.ok) return { status: 'warn', why: `Could not load /robots.txt: ${robots.error}` };
  if (robots.status >= 400) return { status: 'warn', why: `/robots.txt answers ${robots.status}.` };
  if (looksLikeHtml(robots)) {
    return { status: 'warn', why: '/robots.txt returns an HTML page (often an SPA fallback), not a robots file.', fix: 'Serve a real text/plain /robots.txt; make sure static files win over the SPA fallback route.' };
  }
  if (robotsBlocksAll(robots.text)) {
    return { status: 'fail', why: 'robots.txt has "Disallow: /" for all crawlers, so search engines will not index the site.', fix: 'Remove `Disallow: /` from the `User-agent: *` group (it is usually left over from staging).' };
  }
  return { status: 'pass', why: '/robots.txt exists and allows crawling.' };
}

export function checkSitemap(sitemap: PageSnapshot['sitemap']): Outcome {
  const where = sitemap.source === 'robots' ? `the sitemap listed in robots.txt (${sitemap.url})` : '/sitemap.xml';
  if (sitemap.source === 'cross-origin') {
    return { status: 'pass', why: `robots.txt lists a sitemap on another origin (${sitemap.url}). It was not fetched, so its content is not checked.` };
  }
  if (!sitemap.ok) return { status: 'warn', why: `Could not load ${where}: ${sitemap.error}` };
  const head = sitemap.text.slice(0, 4096);
  if (sitemap.status === 200 && /<(urlset|sitemapindex)\b/i.test(head)) {
    return sitemap.source === 'robots'
      ? { status: 'pass', why: `Sitemap found and listed in robots.txt: ${sitemap.url}` }
      : { status: 'pass', why: '/sitemap.xml exists. Listing it in robots.txt helps crawlers find it.' };
  }
  if (sitemap.status === 200 && /\.txt$/i.test(new URL(sitemap.url).pathname) && head.trim().startsWith('http')) {
    return { status: 'pass', why: `Plain-text sitemap found: ${sitemap.url}` };
  }
  return { status: 'warn', why: `No sitemap: ${where} answers ${sitemap.status}${sitemap.status === 200 ? ' but is not a sitemap' : ''}.` };
}

export function checkFavicon(page: PageFacts, favicon: FetchedFile | null): Outcome {
  if (page.hasIconLink) return { status: 'pass', why: 'The page links an icon.' };
  if (favicon?.ok && favicon.status === 200 && favicon.text.length > 0 && !looksLikeHtml(favicon)) {
    return { status: 'pass', why: '/favicon.ico exists (no <link rel="icon">, browsers find it by default).' };
  }
  return { status: 'warn', why: 'No <link rel="icon"> and no /favicon.ico.' };
}
