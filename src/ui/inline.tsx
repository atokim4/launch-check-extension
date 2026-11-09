/** Renders `code` spans from catalog and check text; everything else stays plain text (no HTML parsing). */
export function Inline({ text }: { text: string }) {
  return <>{text.split(/(`[^`]+`)/).map((part) => (part.length > 2 && part.startsWith('`') && part.endsWith('`') ? <code>{part.slice(1, -1)}</code> : part))}</>;
}
