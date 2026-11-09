import { describe, expect, it } from 'vitest';
import { CATALOG } from '../src/core/catalog';
import { robotsBlocksAll } from '../src/core/page-checks';
import { buildReport, toMarkdown } from '../src/core/report';
import type { LaunchReport } from '../src/core/types';
import { collectFrom } from './harness';
import { DEMO_SERVICE_JWT, openAiKey, SERVICE_JWT, stripeKey } from './fixtures/keys';
import { goodSite, leakySite } from './fixtures/site';

const byId = (report: LaunchReport, id: string) => {
  const check = report.checks.find((c) => c.id === id);
  if (!check) throw new Error(`no check ${id}`);
  return check;
};

describe('buildReport on a well-configured page', async () => {
  const report = buildReport((await collectFrom(goodSite())).snapshot);

  it('passes every check and grades it A', () => {
    const notPassing = report.checks.filter((c) => c.status !== 'pass' && c.id !== 'supabase-public-config');
    expect(notPassing).toEqual([]);
    expect(report).toMatchObject({ score: 100, grade: 'A' });
  });

  it('notes the public Supabase config as info, without affecting the score', () => {
    expect(byId(report, 'supabase-public-config')).toMatchObject({ status: 'info', critical: false });
    expect(byId(report, 'supabase-public-config').why).toContain('abcdefghijklmnopqrst');
  });

  it('has one result per catalog entry, in catalog order', () => {
    expect(report.checks.map((c) => c.id)).toEqual(CATALOG.map((c) => c.id));
  });
});

describe('buildReport on a leaky AI-built page', async () => {
  const site = leakySite();
  const report = buildReport((await collectFrom(site)).snapshot);

  it('flags the service_role key as critical and grades the page F', () => {
    expect(byId(report, 'supabase-service-role')).toMatchObject({ status: 'fail', critical: true });
    expect(report.grade).toBe('F');
    expect(report.score).toBeLessThanOrEqual(39);
  });

  it('lists the Stripe and OpenAI keys and the secret env names', () => {
    expect(byId(report, 'secret-keys').why).toContain('Stripe live secret key, OpenAI API key');
    expect(byId(report, 'env-secrets').why).toMatch(/VITE_SUPABASE_SERVICE_ROLE_KEY.*VITE_ADMIN_PASSWORD|VITE_ADMIN_PASSWORD.*VITE_SUPABASE_SERVICE_ROLE_KEY/);
    expect(byId(report, 'env-secrets').why).toContain('VITE_OPENAI_API_KEY');
  });

  it('flags missing headers, mixed content, missing tags and the SPA-fallback robots.txt', () => {
    for (const id of ['hsts', 'csp', 'frame-protection', 'nosniff', 'mixed-content', 'meta-description', 'html-lang', 'viewport', 'open-graph']) {
      expect(byId(report, id).status, id).toBe('fail');
    }
    expect(byId(report, 'referrer-policy').status).toBe('warn');
    expect(byId(report, 'robots-txt').why).toContain('SPA fallback');
    expect(byId(report, 'source-maps')).toMatchObject({ status: 'warn' });
    expect(byId(report, 'source-maps').why).toContain('full original source');
  });

  it('never puts a full secret into the Markdown report', () => {
    const markdown = toMarkdown(report);
    for (const secret of [SERVICE_JWT, stripeKey('sk', 'live'), openAiKey(), 'sample-admin-pass']) {
      expect(markdown).not.toContain(secret);
    }
    expect(markdown).toContain('Score ');
    expect(markdown.indexOf('(critical)')).toBeLessThan(markdown.indexOf('Page title'));
  });
});

describe('buildReport edge cases', () => {
  it('only warns for the Supabase CLI demo service_role key', async () => {
    const site = goodSite();
    site['/assets/app.js'] = { body: `const admin=createClient("http://127.0.0.1:54321","${DEMO_SERVICE_JWT}")` };
    const report = buildReport((await collectFrom(site)).snapshot);
    expect(byId(report, 'supabase-service-role')).toMatchObject({ status: 'warn', critical: false });
    expect(report.grade).not.toBe('F');
  });

  it('treats a Stripe test key as a failure but not as critical', async () => {
    const site = goodSite();
    site['/assets/app.js'] = { body: `const s="${stripeKey('sk', 'test')}"` };
    const report = buildReport((await collectFrom(site)).snapshot);
    expect(byId(report, 'secret-keys')).toMatchObject({ status: 'fail', critical: false });
  });

  it('skips header checks when the page cannot be re-loaded', async () => {
    const site = goodSite();
    site['/'] = { ...site['/']!, hang: true };
    const { snapshot } = await collectFrom(site, { limits: { timeoutMs: 30 } });
    const report = buildReport(snapshot);
    expect(byId(report, 'csp')).toMatchObject({ status: 'skip' });
    expect(byId(report, 'csp').why).toContain('timed out');
    expect(byId(report, 'title').status).toBe('pass');
  });

  it('warns instead of failing on a local dev server', async () => {
    const report = buildReport({ ...(await collectFrom(goodSite())).snapshot, url: 'http://localhost:5173/' });
    expect(byId(report, 'https')).toMatchObject({ status: 'warn' });
  });

  it('mentions truncated scripts in the scan summary', async () => {
    const site = goodSite();
    site['/assets/app.js'] = { body: 'z'.repeat(5000) };
    const report = buildReport((await collectFrom(site, { limits: { maxBytesPerScript: 1000 } })).snapshot);
    expect(byId(report, 'secret-keys').why).toContain('1 cut at the size limit');
  });
});

describe('robotsBlocksAll', () => {
  it('detects Disallow: / for every crawler', () => {
    expect(robotsBlocksAll('User-agent: *\nDisallow: /')).toBe(true);
    expect(robotsBlocksAll('User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nAllow: /')).toBe(false);
    expect(robotsBlocksAll('User-agent: *\nDisallow: /admin')).toBe(false);
    expect(robotsBlocksAll('User-agent: bot\nUser-agent: *\nDisallow: / # staging')).toBe(true);
  });
});
