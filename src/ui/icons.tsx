import type { CheckStatus } from '@/core/types';

/** One authored set: 16px grid, 1.75 stroke, round caps. Decorative unless a label is passed. */
function Svg({ children, label, size = 16 }: { children: preact.ComponentChildren; label?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden={label ? undefined : 'true'}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const StatusIcon = ({ status, label }: { status: CheckStatus; label?: string }) => {
  switch (status) {
    case 'fail':
      return <Svg label={label}><circle cx="8" cy="8" r="6.25" /><path d="M5.75 5.75l4.5 4.5M10.25 5.75l-4.5 4.5" /></Svg>;
    case 'warn':
      return <Svg label={label}><path d="M8 2.25L14.25 13.25H1.75Z" /><path d="M8 6.5v3M8 11.4v.1" /></Svg>;
    case 'info':
      return <Svg label={label}><circle cx="8" cy="8" r="6.25" /><path d="M8 7.25v3.75M8 4.9v.1" /></Svg>;
    case 'pass':
      return <Svg label={label}><path d="M3 8.5l3.25 3.25L13 4.75" /></Svg>;
    case 'skip':
      return <Svg label={label}><path d="M4 8h8" /></Svg>;
  }
};

export const Chevron = () => <Svg size={14}><path d="M5.5 3.5L10 8l-4.5 4.5" /></Svg>;
export const RefreshIcon = () => <Svg><path d="M13.25 8a5.25 5.25 0 1 1-1.6-3.78" /><path d="M13.5 2.5v3h-3" /></Svg>;
export const CopyIcon = () => <Svg><rect x="5.25" y="5.25" width="8" height="8" rx="1.5" /><path d="M10.75 5.25V3.5a.75.75 0 0 0-.75-.75H3.5a.75.75 0 0 0-.75.75V10c0 .41.34.75.75.75h1.75" /></Svg>;
export const CheckIcon = () => <Svg><path d="M3 8.5l3.25 3.25L13 4.75" /></Svg>;
export const ArrowIcon = () => <Svg size={14}><path d="M5 11l6-6M6 5h5v5" /></Svg>;

/** The brand mark: a tag with a tick, reused for the toolbar icons. */
export const Mark = () => (
  <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <rect x="2" y="2" width="28" height="28" rx="7" fill="var(--ink)" />
    <path d="M9.5 16.5l4.5 4.5 8.5-10" fill="none" stroke="var(--paper)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);
