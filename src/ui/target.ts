/** The tab the popup checks. */
export interface TargetTab {
  id: number;
  url: string | undefined;
}

/**
 * Normally the active tab of the current window (the toolbar click grants activeTab on it).
 * The E2E build opens the popup as a page and passes `?target=<url>`; only that build has host
 * permissions for 127.0.0.1, so the store build never takes this branch.
 */
export async function resolveTarget(): Promise<TargetTab | null> {
  if (__E2E__) {
    const target = new URLSearchParams(location.search).get('target');
    if (target) {
      const tabs = await browser.tabs.query({});
      const tab = tabs.find((t) => t.url?.startsWith(target));
      return tab?.id === undefined ? null : { id: tab.id, url: tab.url };
    }
  }
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id === undefined ? null : { id: tab.id, url: tab.url };
}
