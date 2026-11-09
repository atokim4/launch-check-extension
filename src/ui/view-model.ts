import type { CheckCategory, CheckResult, CheckStatus, LaunchReport } from '@/core/types';

export const CATEGORY_LABEL: Record<CheckCategory, string> = {
  leaks: 'Leaked keys',
  security: 'Security headers',
  seo: 'Search and sharing',
};

const CATEGORY_ORDER: CheckCategory[] = ['leaks', 'security', 'seo'];
const STATUS_ORDER: CheckStatus[] = ['fail', 'warn', 'info', 'pass', 'skip'];

export const STATUS_LABEL: Record<CheckStatus, string> = {
  fail: 'Failed',
  warn: 'Warning',
  info: 'Review',
  pass: 'Passed',
  skip: 'Skipped',
};

export type Filter = 'attention' | 'all';

export function needsAttention(check: CheckResult): boolean {
  return check.critical || check.status === 'fail' || check.status === 'warn' || check.status === 'info';
}

export function sortChecks(checks: CheckResult[]): CheckResult[] {
  return [...checks].sort(
    (a, b) => Number(b.critical) - Number(a.critical) || STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
  );
}

export interface CheckGroup {
  category: CheckCategory;
  label: string;
  checks: CheckResult[];
  /** Fail + warn count of the whole category, whatever the filter shows. */
  problems: number;
}

/** Categories in a fixed order, worst checks first; empty groups are dropped. */
export function groupChecks(report: LaunchReport, filter: Filter): CheckGroup[] {
  return CATEGORY_ORDER.map((category) => {
    const all = report.checks.filter((c) => c.category === category);
    return {
      category,
      label: CATEGORY_LABEL[category],
      checks: sortChecks(filter === 'all' ? all : all.filter(needsAttention)),
      problems: all.filter((c) => c.status === 'fail' || c.status === 'warn').length,
    };
  }).filter((group) => group.checks.length > 0);
}

/** One plain sentence under the grade. */
export function headline(report: LaunchReport): string {
  const critical = report.checks.filter((c) => c.critical).length;
  if (critical) return critical === 1 ? 'A secret key is exposed in this page’s scripts. Fix it before launch.' : `${critical} critical leaks are exposed in this page’s scripts. Fix them before launch.`;
  const { fail, warn } = report.counts;
  if (fail === 0 && warn === 0) return 'Nothing to fix on this page.';
  const parts = [fail && `${fail} ${fail === 1 ? 'check' : 'checks'} failed`, warn && `${warn} ${warn === 1 ? 'warning' : 'warnings'}`].filter(Boolean);
  return fail === 0 ? `${parts.join(' and ')}, nothing failed.` : `${parts.join(' and ')}.`;
}

/** Host of a web page, or null for browser and extension pages. */
export function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.host : null;
  } catch {
    return null;
  }
}
