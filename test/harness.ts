import { Window } from 'happy-dom';
import { vi } from 'vitest';
import { collectPage, DEFAULT_LIMITS } from '../src/core/collect';
import type { CollectLimits, PageSnapshot } from '../src/core/types';
import { ORIGIN, type FakeSite } from './fixtures/site';

export interface Run {
  snapshot: PageSnapshot;
  /** Every URL the collector requested, in order. */
  requests: string[];
}

/**
 * Loads the page into a happy-dom window (scripts are parsed, never fetched or run by happy-dom),
 * routes `fetch` to the fake site, and runs the real collector against it.
 */
export async function collectFrom(site: FakeSite, options: { path?: string; limits?: Partial<CollectLimits>; resources?: { name: string; initiatorType: string }[] } = {}): Promise<Run> {
  const path = options.path ?? '/';
  const window = new Window({
    url: `${ORIGIN}${path}`,
    settings: { disableJavaScriptFileLoading: true, disableJavaScriptEvaluation: true, disableCSSFileLoading: true, disableIframePageLoading: true },
  });
  window.document.write(site[path]?.body ?? '');
  const requests: string[] = [];
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('location', window.location);
  // The resource timeline is how the collector finds lazy-loaded chunks; happy-dom does not fill it.
  const realNow = performance.now.bind(performance);
  vi.stubGlobal('performance', { now: realNow, getEntriesByType: (type: string) => (type === 'resource' ? (options.resources ?? []) : []) });
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    requests.push(input);
    const target = new URL(input);
    const page = target.origin === ORIGIN ? site[target.pathname] : undefined;
    if (!page) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    if (page.hang) {
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    }
    return new Response(page.body, { status: page.status ?? 200, headers: page.headers ?? {} });
  });
  try {
    const snapshot = await collectPage({ ...DEFAULT_LIMITS, ...options.limits });
    return { snapshot, requests };
  } finally {
    vi.unstubAllGlobals();
    await window.happyDOM.close();
  }
}
