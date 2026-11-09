import { mkdir } from 'node:fs/promises';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { goodSite, leakySite } from '../test/fixtures/site';
import { serveFixture, type FixtureServer } from './fixture-server';
import { launch, type Harness } from './harness';

// `npm run screenshots`: popup images of the sample fixtures for the README and store listings.
const OUT = 'docs/screenshots';
describe.runIf(process.env.SHOTS === '1')('screenshots', () => {
  let harness: Harness;
  let good: FixtureServer;
  let leaky: FixtureServer;

  beforeAll(async () => {
    await mkdir(OUT, { recursive: true });
    [good, leaky] = await Promise.all([serveFixture(goodSite()), serveFixture(leakySite())]);
    harness = await launch({ deviceScaleFactor: 2 });
  }, 60_000);

  afterAll(async () => {
    await harness?.context.close();
    await Promise.all([good?.close(), leaky?.close()]);
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    it(`leaky page, ${colorScheme}`, async () => {
      const popup = await harness.openPopup(`${leaky.origin}/`, { colorScheme });
      await popup.waitForTimeout(600); // let the stamp settle
      await popup.screenshot({ path: `${OUT}/popup-leaky-${colorScheme}.png`, fullPage: true });
    });
  }
  it('good page with a snippet open', async () => {
    const popup = await harness.openPopup(`${good.origin}/`, { colorScheme: 'light' });
    await popup.locator('li[data-id="https"] .check-row').click();
    await popup.waitForTimeout(600);
    await popup.screenshot({ path: `${OUT}/popup-good-light.png`, fullPage: true });
  });
});
