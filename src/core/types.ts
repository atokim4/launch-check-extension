/** Everything the collector reads from the tab. Plain data, so it survives `scripting.executeScript`. */
export interface PageSnapshot {
  url: string;
  collectedAt: string;
  page: PageFacts;
  /** Headers of a fresh same-origin GET of the page URL. */
  document: FetchedFile;
  robots: FetchedFile;
  /** Sitemap from robots.txt (same origin only) or /sitemap.xml. */
  sitemap: FetchedFile & { source: 'robots' | 'default' | 'cross-origin' };
  /** Only fetched when the page links no icon. */
  favicon: FetchedFile | null;
  scripts: ScannedScript[];
  skippedScripts: { url: string; reason: string }[];
  sourceMaps: SourceMapProbe[];
}

export interface PageFacts {
  lang: string | null;
  title: string | null;
  description: string | null;
  canonical: string | null;
  viewport: string | null;
  og: { title: string | null; description: string | null; image: string | null };
  twitterCard: string | null;
  hasIconLink: boolean;
  /** http:// scripts, styles, frames and form targets (blocked on HTTPS pages). */
  activeInsecure: string[];
  /** http:// images and media (loaded with a warning or upgraded). */
  passiveInsecure: string[];
}

export type FetchedFile =
  | { ok: true; url: string; status: number; redirected: boolean; contentType: string; headers: Record<string, string>; text: string; truncated: boolean }
  | { ok: false; url: string; error: string };

export interface ScannedScript {
  /** null for inline <script> blocks. */
  url: string | null;
  text: string;
  bytes: number;
  truncated: boolean;
  sourceMapRef: string | null;
}

export interface SourceMapProbe {
  scriptUrl: string;
  mapUrl: string;
  /** `comment` = sourceMappingURL in the file, `header` = SourceMap header, `guess` = <script>.map, `inline` = data: URL. */
  via: 'comment' | 'header' | 'guess' | 'inline';
  exposed: boolean;
  hasSourcesContent: boolean;
  status: number | null;
}

export interface CollectLimits {
  maxScripts: number;
  maxBytesPerScript: number;
  maxTotalBytes: number;
  maxSourceMapProbes: number;
  timeoutMs: number;
}

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info' | 'skip';
export type CheckCategory = 'leaks' | 'security' | 'seo';

export interface CheckResult {
  id: string;
  title: string;
  category: CheckCategory;
  status: CheckStatus;
  /** A leak that gives an attacker real access. Any critical result makes the grade F. */
  critical: boolean;
  /** What was found on this page. */
  why: string;
  /** What to change; empty when nothing needs changing. */
  fix: string;
  /** Redacted evidence lines (file and a masked value). Never full secrets. */
  evidence: string[];
}

export interface LaunchReport {
  url: string;
  checkedAt: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  counts: Record<CheckStatus, number>;
  checks: CheckResult[];
  scanned: { scripts: number; bytes: number; skipped: { url: string; reason: string }[] };
}
