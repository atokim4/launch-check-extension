import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildReport } from '../src/core/report';
import { groupChecks, headline, hostOf } from '../src/ui/view-model';
import { collectFrom } from './harness';
import { goodSite, leakySite } from './fixtures/site';

describe('popup view model', () => {
  it('puts the critical leak first and hides passed checks in the "to fix" view', async () => {
    const report = buildReport((await collectFrom(leakySite())).snapshot);
    const groups = groupChecks(report, 'attention');
    expect(groups[0]?.category).toBe('leaks');
    expect(groups[0]?.checks[0]?.critical).toBe(true);
    expect(groups.flatMap((g) => g.checks).every((c) => c.status !== 'pass' && c.status !== 'skip')).toBe(true);
    expect(headline(report)).toMatch(/critical leaks|secret key/);
  });

  it('shows every check in the "all" view, grouped in a fixed order', async () => {
    const report = buildReport((await collectFrom(goodSite())).snapshot);
    const groups = groupChecks(report, 'all');
    expect(groups.map((g) => g.category)).toEqual(['leaks', 'security', 'seo']);
    expect(groups.reduce((n, g) => n + g.checks.length, 0)).toBe(report.checks.length);
    expect(headline(report)).toBe('Nothing to fix on this page.');
  });

  it('names only web hosts', () => {
    expect(hostOf('https://app.example.test/pricing')).toBe('app.example.test');
    expect(hostOf('chrome-extension://abc/popup.html')).toBeNull();
    expect(hostOf(undefined)).toBeNull();
  });
});

// Reads the built store manifests, so it runs after `npm run build && npm run build:firefox` (`npm run check`).
describe.each(['chrome-mv3', 'firefox-mv3'])('store manifest (%s)', (target) => {
  const path = `.output/${target}/manifest.json`;
  it.skipIf(!existsSync(path))('asks for activeTab and scripting only (no host permissions)', () => {
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    expect(manifest.permissions).toEqual(['activeTab', 'scripting']);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
  });
});
