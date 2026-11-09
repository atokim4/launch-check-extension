import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { goodSite, leakySite } from '../test/fixtures/site';
import { serveFixture, type FixtureServer } from './fixture-server';
import { launch, type Harness } from './harness';

let harness: Harness;
let good: FixtureServer;
let leaky: FixtureServer;

beforeAll(async () => {
  [good, leaky] = await Promise.all([serveFixture(goodSite()), serveFixture(leakySite())]);
  harness = await launch();
}, 60_000);

afterAll(async () => {
  await harness?.context.close();
  await Promise.all([good?.close(), leaky?.close()]);
});

describe('popup in Chrome', () => {
  it('grades the leaky page F and opens the service_role finding', async () => {
    const popup = await harness.openPopup(`${leaky.origin}/`);
    expect(await popup.locator('.stamp').textContent()).toBe('F');
    expect(Number(await popup.locator('.num').textContent())).toBeLessThanOrEqual(39);

    const critical = popup.locator('li.is-critical[data-id="supabase-service-role"]');
    await expect.poll(() => critical.count()).toBe(1);
    expect(await critical.locator('.check-row').getAttribute('aria-expanded')).toBe('true');
    const evidence = await critical.locator('.evidence').innerText();
    expect(evidence).toContain('/assets/index-Bx81.js');
    expect(evidence).not.toMatch(/eyJ[\w-]{40,}/); // masked, never the full JWT

    expect(await popup.locator('li[data-id="secret-keys"]').getAttribute('data-status')).toBe('fail');
    expect(await popup.locator('li[data-id="source-maps"]').getAttribute('data-status')).toBe('warn');
    expect(await popup.locator('.headline').innerText()).toMatch(/secret key|critical/i);
  });

  it('copies a Markdown report with masked values only', async () => {
    const popup = await harness.openPopup(`${leaky.origin}/`);
    await popup.getByRole('button', { name: 'Copy as Markdown' }).click();
    await expect.poll(() => popup.locator('.primary').innerText()).toContain('Copied');
    const markdown = await popup.evaluate(() => (window as unknown as { copied: string }).copied);
    expect(markdown).toContain(`## Launch check: ${leaky.origin}/`);
    expect(markdown).toContain('(critical)');
    expect(markdown).not.toMatch(/eyJ[\w-]{40,}\.[\w-]{20,}/);
  });

  it('shows the good page without critical findings and with passing tags', async () => {
    const popup = await harness.openPopup(`${good.origin}/`);
    expect(await popup.locator('li.is-critical').count()).toBe(0);
    await popup.getByRole('radio', { name: /All checks/ }).check();
    for (const id of ['title', 'meta-description', 'open-graph', 'html-lang', 'viewport', 'csp']) {
      expect(await popup.locator(`li[data-id="${id}"]`).getAttribute('data-status'), id).toBe('pass');
    }
    // A local http:// server gets a "run it again on the deployed URL" warning, not a failure.
    expect(await popup.locator('li[data-id="https"]').getAttribute('data-status')).toBe('warn');
  });

  it('expands a finding with the keyboard and shows its fix snippet', async () => {
    const popup = await harness.openPopup(`${good.origin}/`);
    const row = popup.locator('li[data-id="https"] .check-row');
    await row.focus();
    await popup.keyboard.press('Enter');
    expect(await row.getAttribute('aria-expanded')).toBe('true');
    expect(await popup.locator('li[data-id="https"] .snippet pre').innerText()).toContain('certbot');
  });

  it('explains pages it cannot check', async () => {
    const popup = await harness.openPopup();
    expect(await popup.getByRole('alert').innerText()).toContain('Nothing to check here');
    expect(await popup.locator('.host').innerText()).toBe('Current tab');
  });
});
