import type { CollectLimits, FetchedFile, PageFacts, PageSnapshot, ScannedScript, SourceMapProbe } from './types';

export const DEFAULT_LIMITS: CollectLimits = {
  maxScripts: 60,
  maxBytesPerScript: 3 * 1024 * 1024,
  maxTotalBytes: 15 * 1024 * 1024,
  maxSourceMapProbes: 8,
  timeoutMs: 8000,
};

/**
 * Runs inside the inspected tab via `scripting.executeScript({ func: collectPage })`.
 *
 * The browser serialises this function on its own, so it must stay self-contained: no imports, no module-level
 * helpers, only DOM and `fetch`. It is read-only and only requests URLs on the page's own origin.
 */
export async function collectPage(limits: CollectLimits): Promise<PageSnapshot> {
  const origin = location.origin;
  const sameOrigin = (url: string): boolean => {
    try {
      return new URL(url, location.href).origin === origin;
    } catch {
      return false;
    }
  };

  async function fetchCapped(url: string, maxBytes: number): Promise<FetchedFile> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limits.timeoutMs);
    try {
      const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      let text = '';
      let truncated = false;
      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let read = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          read += value.byteLength;
          if (read > maxBytes) {
            text += decoder.decode(value.subarray(0, value.byteLength - (read - maxBytes)));
            truncated = true;
            await reader.cancel();
            break;
          }
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      }
      return {
        ok: true,
        url: res.url || url,
        status: res.status,
        redirected: res.redirected,
        contentType: headers['content-type'] ?? '',
        headers,
        text,
        truncated,
      };
    } catch (error) {
      const message = controller.signal.aborted ? `timed out after ${limits.timeoutMs} ms` : String((error as Error)?.message ?? error);
      return { ok: false, url, error: message };
    } finally {
      clearTimeout(timer);
    }
  }

  // ------------------------------------------------------------ page facts from the live DOM
  const clean = (value: string | null | undefined): string | null => {
    const trimmed = value?.replace(/\s+/g, ' ').trim();
    return trimmed ? trimmed : null;
  };
  const meta = (attr: 'name' | 'property', key: string): string | null => {
    for (const el of Array.from(document.querySelectorAll(`meta[${attr}]`))) {
      if ((el.getAttribute(attr) ?? '').toLowerCase() === key) return clean(el.getAttribute('content'));
    }
    return null;
  };
  const isHttp = (url: string | null | undefined): url is string => !!url && /^http:\/\//i.test(url.trim());
  const active = new Set<string>();
  const passive = new Set<string>();
  document.querySelectorAll('script[src], iframe[src]').forEach((el) => {
    const src = el.getAttribute('src');
    if (isHttp(src)) active.add(src.trim());
  });
  document.querySelectorAll('link[href]').forEach((el) => {
    const rel = (el.getAttribute('rel') ?? '').toLowerCase();
    const href = el.getAttribute('href');
    if (/\b(stylesheet|preload|modulepreload)\b/.test(rel) && isHttp(href)) active.add(href.trim());
  });
  document.querySelectorAll('form[action]').forEach((el) => {
    const action = el.getAttribute('action');
    if (isHttp(action)) active.add(action.trim());
  });
  document.querySelectorAll('img[src], audio[src], video[src], source[src]').forEach((el) => {
    const src = el.getAttribute('src');
    if (isHttp(src)) passive.add(src.trim());
  });
  const resources = (performance.getEntriesByType?.('resource') ?? []) as PerformanceResourceTiming[];
  for (const entry of resources) {
    if (!isHttp(entry.name)) continue;
    (['script', 'link', 'css', 'iframe', 'fetch', 'xmlhttprequest'].includes(entry.initiatorType) ? active : passive).add(entry.name);
  }
  const canonicalEl = Array.from(document.querySelectorAll('link[rel]')).find((el) => (el.getAttribute('rel') ?? '').toLowerCase() === 'canonical');
  const hasIconLink = Array.from(document.querySelectorAll('link[rel]')).some((el) =>
    /(^|\s)(icon|shortcut icon|apple-touch-icon)(\s|$)/i.test(el.getAttribute('rel') ?? ''),
  );
  const page: PageFacts = {
    lang: clean(document.documentElement.getAttribute('lang')),
    title: clean(document.title),
    description: meta('name', 'description'),
    canonical: clean(canonicalEl?.getAttribute('href')),
    viewport: meta('name', 'viewport'),
    og: { title: meta('property', 'og:title'), description: meta('property', 'og:description'), image: meta('property', 'og:image') },
    twitterCard: meta('name', 'twitter:card'),
    hasIconLink,
    activeInsecure: [...active],
    passiveInsecure: [...passive],
  };

  // ------------------------------------------------------------ site files on the same origin
  const SMALL = 256 * 1024;
  const [documentFile, robots] = await Promise.all([fetchCapped(location.href, 64 * 1024), fetchCapped(`${origin}/robots.txt`, SMALL)]);
  const listed = robots.ok && robots.status === 200 ? /^\s*sitemap\s*:\s*(\S+)/im.exec(robots.text)?.[1] : undefined;
  let sitemap: PageSnapshot['sitemap'];
  if (listed && !sameOrigin(listed)) {
    sitemap = { ok: false, url: listed, error: 'listed on another origin, not fetched', source: 'cross-origin' };
  } else {
    const target = listed ? new URL(listed, origin).toString() : `${origin}/sitemap.xml`;
    sitemap = { ...(await fetchCapped(target, 16 * 1024)), source: listed ? 'robots' : 'default' };
  }
  const favicon = hasIconLink ? null : await fetchCapped(`${origin}/favicon.ico`, 1024);

  // ------------------------------------------------------------ scripts the page loaded from its own origin
  const scripts: ScannedScript[] = [];
  const skippedScripts: { url: string; reason: string }[] = [];
  const mapRefOf = (text: string): string | null => /\/\/[#@]\s*sourceMappingURL=(\S+)\s*$/.exec(text.slice(-1000))?.[1] ?? null;

  document.querySelectorAll('script:not([src])').forEach((el) => {
    const type = (el.getAttribute('type') ?? '').toLowerCase();
    if (type && !/javascript|module|json|ecmascript/.test(type)) return;
    const text = el.textContent ?? '';
    if (text.trim()) scripts.push({ url: null, text, bytes: text.length, truncated: false, sourceMapRef: mapRefOf(text) });
  });

  const urls = new Set<string>();
  const addUrl = (raw: string | null): void => {
    if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return;
    const absolute = new URL(raw, location.href);
    absolute.hash = '';
    const href = absolute.toString();
    if (urls.has(href) || skippedScripts.some((s) => s.url === href)) return;
    if (absolute.origin !== origin) skippedScripts.push({ url: href, reason: 'other origin (not fetched)' });
    else urls.add(href);
  };
  document.querySelectorAll('script[src]').forEach((el) => addUrl(el.getAttribute('src')));
  document.querySelectorAll('link[rel="modulepreload"][href]').forEach((el) => addUrl(el.getAttribute('href')));
  for (const entry of resources) {
    // Lazy-loaded chunks only show up in the resource timeline.
    if (entry.initiatorType === 'script' || (/\.m?js(\?|$)/.test(entry.name) && ['link', 'other'].includes(entry.initiatorType))) addUrl(entry.name);
  }

  let total = scripts.reduce((sum, s) => sum + s.bytes, 0);
  const headerMaps = new Map<string, string>();
  const queue = [...urls];
  for (const [i, url] of queue.entries()) {
    if (i >= limits.maxScripts) {
      skippedScripts.push({ url, reason: `over the ${limits.maxScripts}-file limit` });
      continue;
    }
    if (total >= limits.maxTotalBytes) {
      skippedScripts.push({ url, reason: 'total size limit reached' });
      continue;
    }
    const file = await fetchCapped(url, Math.min(limits.maxBytesPerScript, limits.maxTotalBytes - total));
    if (!file.ok) {
      skippedScripts.push({ url, reason: file.error });
      continue;
    }
    if (file.status >= 400) {
      skippedScripts.push({ url, reason: `HTTP ${file.status}` });
      continue;
    }
    total += file.text.length;
    const header = file.headers['sourcemap'] ?? file.headers['x-sourcemap'];
    if (header) headerMaps.set(url, header);
    scripts.push({ url, text: file.text, bytes: file.text.length, truncated: file.truncated, sourceMapRef: file.truncated ? null : mapRefOf(file.text) });
  }

  // ------------------------------------------------------------ source maps
  const sourceMaps: SourceMapProbe[] = [];
  let probes = 0;
  for (const script of scripts) {
    if (!script.url) continue;
    const ref = headerMaps.get(script.url) ?? script.sourceMapRef;
    if (ref?.startsWith('data:')) {
      sourceMaps.push({ scriptUrl: script.url, mapUrl: 'data: URL', via: 'inline', exposed: true, hasSourcesContent: /sourcesContent/.test(ref), status: null });
      continue;
    }
    if (probes >= limits.maxSourceMapProbes) break;
    const via: SourceMapProbe['via'] = headerMaps.has(script.url) ? 'header' : ref ? 'comment' : 'guess';
    // Guessing `<file>.map` costs a request per file, so only the first few files get a guess.
    if (via === 'guess' && probes >= 3) continue;
    const mapUrl = new URL(ref ?? `${script.url.split('?')[0]}.map`, script.url).toString();
    if (!sameOrigin(mapUrl)) continue;
    probes++;
    const res = await fetchCapped(mapUrl, 64 * 1024);
    const exposed = res.ok && res.status === 200 && /^\s*\{/.test(res.text) && /"(version|mappings)"\s*:/.test(res.text);
    if (via !== 'guess' || exposed) {
      sourceMaps.push({
        scriptUrl: script.url,
        mapUrl,
        via,
        exposed,
        hasSourcesContent: exposed && res.ok && /"sourcesContent"\s*:/.test(res.text),
        status: res.ok ? res.status : null,
      });
    }
  }

  return {
    url: location.href,
    collectedAt: new Date().toISOString(),
    page,
    document: documentFile,
    robots,
    sitemap,
    favicon,
    scripts,
    skippedScripts,
    sourceMaps,
  };
}
