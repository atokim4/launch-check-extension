import { useCallback, useEffect, useState } from 'preact/hooks';
import { runLaunchCheck, unsupportedReason } from '@/core/run';
import type { LaunchReport } from '@/core/types';
import { resolveTarget } from './target';

export type CheckState =
  | { kind: 'loading'; url?: string }
  | { kind: 'unsupported'; message: string; url?: string }
  | { kind: 'error'; message: string; url?: string }
  | { kind: 'done'; report: LaunchReport };

function explain(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/cannot access|cannot be scripted|missing host permission|permission/i.test(message)) {
    return 'The browser blocked access to this tab. Click the toolbar button again while the page is open.';
  }
  if (/frame|tab was closed|no tab/i.test(message)) return 'The tab changed or closed while checking. Run the check again.';
  return message;
}

export function useLaunchCheck(): { state: CheckState; run: () => void } {
  const [state, setState] = useState<CheckState>({ kind: 'loading' });

  const run = useCallback(() => {
    void (async () => {
      setState((prev) => ({ kind: 'loading', url: prev.kind === 'done' ? prev.report.url : prev.url }));
      const tab = await resolveTarget().catch(() => null);
      if (!tab) return setState({ kind: 'error', message: 'No tab to check. Open your site and click the toolbar button.' });
      const reason = unsupportedReason(tab.url);
      if (reason) return setState({ kind: 'unsupported', message: reason, url: tab.url });
      try {
        setState({ kind: 'done', report: await runLaunchCheck(tab.id) });
      } catch (error) {
        setState({ kind: 'error', message: explain(error), url: tab.url });
      }
    })();
  }, []);

  useEffect(run, [run]);
  return { state, run };
}
