import { useState } from 'preact/hooks';
import { toMarkdown } from '@/core/report';
import type { LaunchReport } from '@/core/types';
import { CheckItem } from '@/ui/CheckItem';
import { AUDIT_OFFER_URL } from '@/ui/config';
import { CopyButton } from '@/ui/CopyButton';
import { ArrowIcon, Mark, RefreshIcon } from '@/ui/icons';
import { useLaunchCheck } from '@/ui/use-launch-check';
import { groupChecks, headline, hostOf, needsAttention, type Filter } from '@/ui/view-model';

function Strip({ report }: { report: LaunchReport }) {
  // One tick per check in catalog order: the whole checklist at a glance. The list below carries the data.
  return (
    <div class="strip" aria-hidden="true">
      {report.checks.map((c) => <span class={`tick s-${c.status}${c.critical ? ' crit' : ''}`} title={c.title} />)}
    </div>
  );
}

function Results({ report }: { report: LaunchReport }) {
  const attention = report.checks.filter(needsAttention).length;
  const [filter, setFilter] = useState<Filter>(attention ? 'attention' : 'all');
  const groups = groupChecks(report, filter);
  const { fail, warn, pass } = report.counts;
  const critical = report.checks.some((c) => c.critical);

  return (
    <>
      <section class={`score grade-${report.grade}${critical ? ' has-critical' : ''}`} aria-labelledby="score-title">
        <div class="stamp" aria-hidden="true">{report.grade}</div>
        <div class="score-text">
          <h1 id="score-title">
            <span class="num">{report.score}</span><span class="of">/100</span>
            <span class="sr-only">, grade {report.grade}</span>
          </h1>
          <p class="headline">{headline(report)}</p>
          <p class="counts">
            <span class="c-fail">{fail} failed</span>
            <span class="c-warn">{warn} {warn === 1 ? 'warning' : 'warnings'}</span>
            <span class="c-pass">{pass} passed</span>
          </p>
        </div>
      </section>
      <Strip report={report} />

      <div class="filter" role="radiogroup" aria-label="Show">
        <label>
          <input type="radio" name="filter" checked={filter === 'attention'} onChange={() => setFilter('attention')} />
          <span>To fix <span class="n">{attention}</span></span>
        </label>
        <label>
          <input type="radio" name="filter" checked={filter === 'all'} onChange={() => setFilter('all')} />
          <span>All checks <span class="n">{report.checks.length}</span></span>
        </label>
      </div>

      {groups.length === 0 ? (
        <p class="empty">Every check passed. Switch to “All checks” to see them.</p>
      ) : (
        groups.map((group) => (
          <section class="group" aria-labelledby={`g-${group.category}`} key={`${filter}-${group.category}`}>
            <h2 id={`g-${group.category}`}>
              {group.label}
              <span class="group-count">{group.problems ? `${group.problems} to fix` : 'all clear'}</span>
            </h2>
            <ul class="checks">{group.checks.map((c) => <CheckItem key={c.id} check={c} />)}</ul>
          </section>
        ))
      )}

      <p class="scanned">
        Scanned {report.scanned.scripts} {report.scanned.scripts === 1 ? 'script' : 'scripts'} from this site ({Math.max(1, Math.round(report.scanned.bytes / 1024))} KB)
        {report.scanned.skipped.length > 0 && `, skipped ${report.scanned.skipped.length} from other sites or over the size limit`}.
        Reads only what this site already sent. Nothing is sent anywhere else.
      </p>
    </>
  );
}

export function App() {
  const { state, run } = useLaunchCheck();
  const url = state.kind === 'done' ? state.report.url : state.url;

  return (
    <div class="shell" aria-busy={state.kind === 'loading'}>
      <header class="top">
        <Mark />
        <div class="where">
          <span class="product">Launch Check</span>
          <span class="host" title={hostOf(url) ? url : undefined}>{hostOf(url) ?? 'Current tab'}</span>
        </div>
        <button type="button" class="ghost" onClick={run} disabled={state.kind === 'loading'}>
          <RefreshIcon />
          <span>{state.kind === 'loading' ? 'Checking' : 'Run again'}</span>
        </button>
      </header>

      <main class="body">
        <div class="sr-only" aria-live="polite">
          {state.kind === 'loading' ? 'Checking this page.' : state.kind === 'done' ? `Done. Score ${state.report.score} of 100.` : ''}
        </div>
        {state.kind === 'loading' && (
          <div class="loading">
            <div class="strip skeleton" aria-hidden="true">{Array.from({ length: 22 }, (_, i) => <span class="tick" style={{ animationDelay: `${i * 45}ms` }} />)}</div>
            <p>Reading the page, its headers and its scripts…</p>
          </div>
        )}
        {(state.kind === 'unsupported' || state.kind === 'error') && (
          <div class={`notice ${state.kind}`} role="alert">
            <h1>{state.kind === 'unsupported' ? 'Nothing to check here' : 'The check did not finish'}</h1>
            <p>{state.message}</p>
          </div>
        )}
        {state.kind === 'done' && <Results report={state.report} />}
      </main>

      <footer class="bottom">
        {state.kind === 'done' && (
          <CopyButton class="primary" label="Copy as Markdown" text={() => toMarkdown(state.report)} />
        )}
        <a class="offer" href={AUDIT_OFFER_URL} target="_blank" rel="noopener noreferrer">
          Want a full repo audit? $49 <ArrowIcon />
        </a>
      </footer>
    </div>
  );
}
