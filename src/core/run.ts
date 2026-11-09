import { collectPage, DEFAULT_LIMITS } from './collect';
import { buildReport } from './report';
import type { LaunchReport, PageSnapshot } from './types';

/** Pages no extension may script: browser UI, extension stores, local files. */
export function unsupportedReason(url: string | undefined): string | null {
  if (!url) return 'This tab has no address the extension can read.';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'This tab has no address the extension can read.';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'Open your site in this tab first. Browser pages and local files cannot be checked.';
  if (/^(chromewebstore\.google\.com|chrome\.google\.com|microsoftedge\.microsoft\.com|addons\.mozilla\.org)$/.test(parsed.hostname)) {
    return 'Browsers do not let extensions run on add-on store pages.';
  }
  return null;
}

/** Collects a snapshot in the given tab (needs the activeTab grant from a toolbar click) and scores it. */
export async function runLaunchCheck(tabId: number): Promise<LaunchReport> {
  const [injection] = await browser.scripting.executeScript({ target: { tabId }, func: collectPage, args: [DEFAULT_LIMITS] });
  const snapshot = injection?.result as PageSnapshot | undefined;
  if (!snapshot) throw new Error('The page did not return any data. Reload it and try again.');
  return buildReport(snapshot);
}
