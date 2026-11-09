import { CATALOG, definition } from './catalog';
import { checkEnvSecrets, checkSecretKeys, checkServiceRole, checkSourceMaps, checkSupabaseConfig, scanScripts } from './leak-checks';
import { skip, type Outcome } from './outcome';
import * as page from './page-checks';
import type { CheckResult, CheckStatus, LaunchReport, PageSnapshot } from './types';

const STATUS_POINTS: Record<CheckStatus, number | null> = { pass: 1, warn: 0.5, fail: 0, info: null, skip: null };
/** A critical leak caps the score here, whatever the SEO tags look like. */
const CRITICAL_CAP = 39;

function toResult(id: string, outcome: Outcome): CheckResult {
  const def = definition(id);
  const needsFix = outcome.status === 'fail' || outcome.status === 'warn' || outcome.status === 'info';
  return {
    id,
    title: def.title,
    category: def.category,
    status: outcome.status,
    critical: outcome.critical ?? false,
    why: outcome.why,
    fix: needsFix ? (outcome.fix ?? def.fix) : '',
    evidence: outcome.evidence ?? [],
  };
}

export function scoreChecks(checks: CheckResult[]): Pick<LaunchReport, 'score' | 'grade'> {
  let earned = 0;
  let possible = 0;
  for (const check of checks) {
    const points = STATUS_POINTS[check.status];
    const { weight } = definition(check.id);
    if (points === null || weight === 0) continue;
    possible += weight;
    earned += weight * points;
  }
  let score = possible === 0 ? 0 : Math.round((earned / possible) * 100);
  if (checks.some((c) => c.critical)) score = Math.min(score, CRITICAL_CAP);
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 55 ? 'D' : 'F';
  return { score, grade };
}

export function buildReport(snapshot: PageSnapshot): LaunchReport {
  const url = new URL(snapshot.url);
  const doc = snapshot.document;
  const headers = doc.ok ? doc.headers : null;
  const noHeaders = skip(`Skipped: could not re-load the page to read its headers (${doc.ok ? 'unknown error' : doc.error}).`);
  const scan = scanScripts(snapshot.scripts);

  const outcomes: Record<string, Outcome> = {
    'supabase-service-role': checkServiceRole(scan, snapshot),
    'secret-keys': checkSecretKeys(scan, snapshot),
    'env-secrets': checkEnvSecrets(scan, snapshot),
    'source-maps': checkSourceMaps(snapshot),
    'supabase-public-config': checkSupabaseConfig(scan),
    https: page.checkHttps(url),
    hsts: headers ? page.checkHsts(headers, url) : noHeaders,
    csp: headers ? page.checkCsp(headers) : noHeaders,
    'frame-protection': headers ? page.checkFrameProtection(headers) : noHeaders,
    nosniff: headers ? page.checkNosniff(headers) : noHeaders,
    'referrer-policy': headers ? page.checkReferrerPolicy(headers) : noHeaders,
    'mixed-content': page.checkMixedContent(snapshot.page, url),
    title: page.checkTitle(snapshot.page),
    'meta-description': page.checkDescription(snapshot.page),
    canonical: page.checkCanonical(snapshot.page, url),
    'open-graph': page.checkOpenGraph(snapshot.page),
    'twitter-card': page.checkTwitterCard(snapshot.page),
    'robots-txt': page.checkRobots(snapshot.robots),
    sitemap: page.checkSitemap(snapshot.sitemap),
    favicon: page.checkFavicon(snapshot.page, snapshot.favicon),
    'html-lang': page.checkLang(snapshot.page),
    viewport: page.checkViewport(snapshot.page),
  };
  const checks = CATALOG.map((def) => toResult(def.id, outcomes[def.id] ?? skip('Skipped.')));
  const counts: Record<CheckStatus, number> = { pass: 0, warn: 0, fail: 0, info: 0, skip: 0 };
  for (const c of checks) counts[c.status]++;
  return {
    url: snapshot.url,
    checkedAt: snapshot.collectedAt,
    ...scoreChecks(checks),
    counts,
    checks,
    scanned: {
      scripts: snapshot.scripts.length,
      bytes: snapshot.scripts.reduce((sum, s) => sum + s.bytes, 0),
      skipped: snapshot.skippedScripts,
    },
  };
}

const ICON: Record<CheckStatus, string> = { fail: '❌', warn: '⚠️', info: 'ℹ️', pass: '✅', skip: '⏭️' };
const ORDER: CheckStatus[] = ['fail', 'warn', 'info', 'pass', 'skip'];

/** Markdown for a PR description, an issue or a chat. Evidence is already masked. */
export function toMarkdown(report: LaunchReport): string {
  const sorted = [...report.checks].sort((a, b) => Number(b.critical) - Number(a.critical) || ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  const { pass, warn, fail } = report.counts;
  const lines = [
    `## Launch check: ${report.url}`,
    '',
    `**Score ${report.score}/100 (grade ${report.grade})** · ${fail} failed · ${warn} warnings · ${pass} passed · ${report.checkedAt.slice(0, 16).replace('T', ' ')} UTC`,
    '',
  ];
  for (const c of sorted) {
    if (c.status === 'skip') continue;
    lines.push(`- ${ICON[c.status]} **${c.title}**${c.critical ? ' (critical)' : ''}: ${c.why}`);
    for (const e of c.evidence) lines.push(`  - \`${e.replace(/`/g, "'")}\``);
    if (c.fix) lines.push(`  - Fix: ${c.fix}`);
  }
  const skipped = report.checks.filter((c) => c.status === 'skip');
  if (skipped.length) lines.push('', `Skipped: ${skipped.map((c) => c.title).join(', ')}.`);
  lines.push(
    '',
    `Scanned ${report.scanned.scripts} script(s) from this origin (${Math.round(report.scanned.bytes / 1024)} KB)` +
      (report.scanned.skipped.length ? `; ${report.scanned.skipped.length} not scanned (other origins or limits).` : '.'),
    'Passive check: it read what the browser had already loaded and sent no requests to third-party APIs.',
  );
  return lines.join('\n');
}
