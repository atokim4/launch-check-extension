import { resolve } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright-core';

// The E2E build (E2E=1 wxt build) is the store build plus host access to 127.0.0.1, because
// activeTab needs a real toolbar click. The popup is opened as a page with ?target=<url>.
const EXTENSION = resolve('.output-e2e/chrome-mv3');

export interface Harness {
  context: BrowserContext;
  extensionId: string;
  openPopup: (siteUrl?: string, options?: { colorScheme?: 'light' | 'dark' }) => Promise<Page>;
}

export async function launch(options: { deviceScaleFactor?: number } = {}): Promise<Harness> {
  const context = await chromium.launchPersistentContext('', {
    executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
    headless: true,
    deviceScaleFactor: options.deviceScaleFactor,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--no-sandbox', '--enable-unsafe-extension-debugging'],
  });
  // Fixture pages reference made-up third-party hosts; keep the run offline.
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  // Chrome 137+ ignores --load-extension in branded builds; this CDP call works with the flag above.
  const cdp = await context.browser()!.newBrowserCDPSession();
  const { id: extensionId } = (await cdp.send('Extensions.loadUnpacked' as never, { path: EXTENSION } as never)) as { id: string };

  async function openPopup(siteUrl?: string, options: { colorScheme?: 'light' | 'dark' } = {}): Promise<Page> {
    if (siteUrl) {
      const site = await context.newPage();
      await site.goto(siteUrl, { waitUntil: 'domcontentloaded' });
    }
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 400, height: 600 });
    if (options.colorScheme) await popup.emulateMedia({ colorScheme: options.colorScheme });
    // Headless Chrome has no system clipboard for extension pages; record what the popup writes.
    await popup.addInitScript(() => {
      navigator.clipboard.writeText = async (text: string) => {
        (window as unknown as { copied: string }).copied = text;
      };
    });
    const query = siteUrl ? `?target=${encodeURIComponent(siteUrl)}` : '';
    await popup.goto(`chrome-extension://${extensionId}/popup.html${query}`);
    await popup.locator(siteUrl ? '.score' : '[role="alert"]').waitFor({ timeout: 20_000 });
    return popup;
  }

  return { context, extensionId, openPopup };
}
