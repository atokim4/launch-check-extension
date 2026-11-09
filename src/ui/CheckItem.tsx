import { useId, useState } from 'preact/hooks';
import { definition } from '@/core/catalog';
import type { CheckResult } from '@/core/types';
import { CopyButton } from './CopyButton';
import { Chevron, StatusIcon } from './icons';
import { Inline } from './inline';
import { STATUS_LABEL } from './view-model';

function Snippets({ id }: { id: string }) {
  const { snippets } = definition(id);
  const [active, setActive] = useState(0);
  const base = useId();
  if (!snippets.length) return null;
  const current = snippets[Math.min(active, snippets.length - 1)]!;

  const onKey = (event: KeyboardEvent) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (active + step + snippets.length) % snippets.length;
    setActive(next);
    document.getElementById(`${base}-tab-${next}`)?.focus();
  };

  return (
    <div class="snippets">
      {snippets.length > 1 && (
        <div role="tablist" aria-label="Fix for" class="snippet-tabs" onKeyDown={onKey}>
          {snippets.map((s, i) => (
            <button
              type="button"
              role="tab"
              id={`${base}-tab-${i}`}
              aria-selected={i === active}
              aria-controls={`${base}-panel`}
              tabIndex={i === active ? 0 : -1}
              onClick={() => setActive(i)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <div class="snippet" role={snippets.length > 1 ? 'tabpanel' : undefined} id={`${base}-panel`} aria-labelledby={snippets.length > 1 ? `${base}-tab-${active}` : undefined}>
        {snippets.length === 1 && <p class="snippet-label">{current.label}</p>}
        <pre><code>{current.code}</code></pre>
        <CopyButton class="ghost small" label="Copy" text={() => current.code} />
      </div>
    </div>
  );
}

export function CheckItem({ check }: { check: CheckResult }) {
  const [open, setOpen] = useState(check.critical);
  const panelId = useId();
  const expandable = check.status !== 'pass' && check.status !== 'skip';
  const { explanation } = definition(check.id);

  const summary = (
    <>
      <span class={`status s-${check.status}`}>
        <StatusIcon status={check.status} label={STATUS_LABEL[check.status]} />
      </span>
      <span class="check-title">{check.title}</span>
      {check.critical && <span class="badge">Critical</span>}
    </>
  );

  return (
    <li class={`check${check.critical ? ' is-critical' : ''}`} data-status={check.status} data-id={check.id}>
      {expandable ? (
        <button type="button" class="check-row" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
          {summary}
          <span class="chevron"><Chevron /></span>
        </button>
      ) : (
        <div class="check-row static">
          {summary}
          <span class="check-note"><Inline text={check.why} /></span>
        </div>
      )}
      {expandable && open && (
        <div class="check-body" id={panelId}>
          <p class="why"><Inline text={check.why} /></p>
          {check.evidence.length > 0 && (
            <ul class="evidence" aria-label="Found in">
              {check.evidence.map((line) => <li><code>{line}</code></li>)}
            </ul>
          )}
          <p class="explain"><Inline text={explanation} /></p>
          {check.fix && <p class="fix"><strong>Fix.</strong> <Inline text={check.fix} /></p>}
          <Snippets id={check.id} />
        </div>
      )}
    </li>
  );
}
