import { useEffect, useRef, useState } from 'preact/hooks';
import { copyText } from './clipboard';
import { CheckIcon, CopyIcon } from './icons';

type Phase = 'idle' | 'copied' | 'failed';

export function CopyButton({ text, label, class: className }: { text: () => string; label: string; class?: string }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onClick = async () => {
    setPhase((await copyText(text())) ? 'copied' : 'failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPhase('idle'), 1800);
  };

  return (
    <button type="button" class={className} data-phase={phase} onClick={onClick}>
      {phase === 'copied' ? <CheckIcon /> : <CopyIcon />}
      <span aria-live="polite">{phase === 'copied' ? 'Copied' : phase === 'failed' ? 'Copy failed' : label}</span>
    </button>
  );
}
