import { describe, expect, it } from 'vitest';
import { collectFrom } from './harness';
import { stripeKey } from './fixtures/keys';
import { goodSite, leakySite, ORIGIN } from './fixtures/site';

describe('collectPage', () => {
  it('reads page facts from the DOM', async () => {
    const { snapshot } = await collectFrom(goodSite());
    expect(snapshot.url).toBe(`${ORIGIN}/`);
    expect(snapshot.page).toMatchObject({
      lang: 'en',
      title: 'Sample Bikes · Repair booking demo',
      canonical: `${ORIGIN}/`,
      viewport: 'width=device-width, initial-scale=1',
      og: { title: 'Sample Bikes', image: `${ORIGIN}/og.png` },
      twitterCard: 'summary_large_image',
      hasIconLink: true,
      activeInsecure: [],
      passiveInsecure: [],
    });
    expect(snapshot.favicon).toBeNull();
  });

  it('only requests URLs on the page origin, and skips third-party scripts', async () => {
    const { snapshot, requests } = await collectFrom(goodSite());
    expect(requests.every((r) => new URL(r).origin === ORIGIN)).toBe(true);
    expect(snapshot.skippedScripts).toEqual([{ url: 'https://cdn.other.test/widget.js', reason: 'other origin (not fetched)' }]);
    expect(snapshot.scripts.map((s) => s.url)).toEqual([`${ORIGIN}/assets/app.js`]);
  });

  it('reads response headers, robots.txt and the sitemap listed there', async () => {
    const { snapshot } = await collectFrom(goodSite());
    expect(snapshot.document.ok && snapshot.document.headers['x-content-type-options']).toBe('nosniff');
    expect(snapshot.robots.ok && snapshot.robots.status).toBe(200);
    expect(snapshot.sitemap).toMatchObject({ ok: true, status: 200, source: 'robots' });
  });

  it('does not fetch a sitemap that robots.txt lists on another origin', async () => {
    const site = goodSite();
    site['/robots.txt'] = { body: 'User-agent: *\nAllow: /\nSitemap: https://cdn.other.test/sitemap.xml' };
    const { snapshot, requests } = await collectFrom(site);
    expect(snapshot.sitemap).toMatchObject({ ok: false, source: 'cross-origin' });
    expect(requests).not.toContain('https://cdn.other.test/sitemap.xml');
  });

  it('records a referenced source map that is not served', async () => {
    const { snapshot } = await collectFrom(goodSite());
    expect(snapshot.sourceMaps).toEqual([
      { scriptUrl: `${ORIGIN}/assets/app.js`, mapUrl: `${ORIGIN}/assets/app.js.map`, via: 'comment', exposed: false, hasSourcesContent: false, status: 404 },
    ]);
  });

  it('finds http:// assets and a public source map with sources inside', async () => {
    const { snapshot } = await collectFrom(leakySite());
    expect(snapshot.page.activeInsecure).toEqual(['http://cdn.insecure.test/analytics.js']);
    expect(snapshot.page.passiveInsecure).toEqual(['http://images.insecure.test/logo.png']);
    expect(snapshot.sourceMaps[0]).toMatchObject({ exposed: true, hasSourcesContent: true, via: 'comment' });
  });

  it('guesses <file>.map when a script has no sourceMappingURL comment', async () => {
    const site = goodSite();
    site['/assets/app.js'] = { headers: { 'content-type': 'text/javascript' }, body: 'console.log(1)' };
    site['/assets/app.js.map'] = { body: '{"version":3,"sources":[],"mappings":""}' };
    const { snapshot } = await collectFrom(site);
    expect(snapshot.sourceMaps).toMatchObject([{ via: 'guess', exposed: true, hasSourcesContent: false }]);
  });

  it('finds lazy-loaded chunks and http:// requests in the resource timeline', async () => {
    const site = goodSite();
    site['/assets/lazy-Settings.js'] = { headers: { 'content-type': 'text/javascript' }, body: 'export const settings=1' };
    const { snapshot } = await collectFrom(site, {
      resources: [
        { name: `${ORIGIN}/assets/lazy-Settings.js`, initiatorType: 'script' },
        { name: 'http://api.insecure.test/v1/items', initiatorType: 'fetch' },
        { name: 'http://img.insecure.test/a.png', initiatorType: 'img' },
      ],
    });
    expect(snapshot.scripts.map((s) => s.url)).toContain(`${ORIGIN}/assets/lazy-Settings.js`);
    expect(snapshot.page.activeInsecure).toEqual(['http://api.insecure.test/v1/items']);
    expect(snapshot.page.passiveInsecure).toEqual(['http://img.insecure.test/a.png']);
  });

  it('scans inline scripts, including JSON data blocks', async () => {
    const site = goodSite();
    site['/'] = {
      body: `<html><head><script>window.cfg={a:1}</script><script type="application/json" id="__NEXT_DATA__">{"props":{}}</script><script type="text/template"><b>skip</b></script></head></html>`,
    };
    const { snapshot } = await collectFrom(site);
    expect(snapshot.scripts.map((s) => s.text)).toEqual(['window.cfg={a:1}', '{"props":{}}']);
  });

  it('stops reading a script at the size cap and marks it truncated', async () => {
    const site = goodSite();
    const huge = `${'x'.repeat(200_000)};const k="${stripeKey('sk', 'live')}";`;
    site['/assets/app.js'] = { headers: { 'content-type': 'text/javascript' }, body: huge };
    const { snapshot } = await collectFrom(site, { limits: { maxBytesPerScript: 100_000 } });
    const script = snapshot.scripts[0];
    expect(script).toMatchObject({ truncated: true, bytes: 100_000 });
    expect(script?.text).not.toContain('sk_live_');
  });

  it('skips files past the file-count and total-size limits', async () => {
    const site = goodSite();
    const extra = Array.from({ length: 4 }, (_, i) => `<script src="/assets/chunk-${i}.js"></script>`).join('');
    site['/'] = { body: `<html><head>${extra}</head></html>` };
    for (let i = 0; i < 4; i++) site[`/assets/chunk-${i}.js`] = { body: `/* chunk ${i} */ ${'y'.repeat(50)}` };
    const { snapshot } = await collectFrom(site, { limits: { maxScripts: 2 } });
    expect(snapshot.scripts).toHaveLength(2);
    expect(snapshot.skippedScripts.map((s) => s.reason)).toEqual(['over the 2-file limit', 'over the 2-file limit']);
  });

  it('reports a timeout instead of hanging', async () => {
    const site = goodSite();
    site['/robots.txt'] = { body: '', hang: true };
    const { snapshot } = await collectFrom(site, { limits: { timeoutMs: 50 } });
    expect(snapshot.robots).toEqual({ ok: false, url: `${ORIGIN}/robots.txt`, error: 'timed out after 50 ms' });
    expect(snapshot.document.ok).toBe(true);
  });
});
