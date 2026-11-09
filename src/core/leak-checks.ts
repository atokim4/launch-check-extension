import type { Outcome } from './outcome';
import { findEnvSecrets, findSecrets, findSupabaseJwts, findSupabaseUrls, type EnvHit, type SecretHit, type SupabaseJwt } from './secrets';
import type { PageSnapshot, ScannedScript } from './types';

const MAX_EVIDENCE = 6;

export function scriptLabel(script: ScannedScript, index: number): string {
  if (!script.url) return `inline script #${index + 1}`;
  const { pathname, search } = new URL(script.url);
  return `${pathname}${search}`.slice(0, 90);
}

interface Located<T> {
  hit: T;
  where: string;
}

/** Runs every detector over every scanned script once and keeps the first file each value appears in. */
export function scanScripts(scripts: ScannedScript[]): {
  secrets: Located<SecretHit>[];
  jwts: Located<SupabaseJwt>[];
  env: Located<EnvHit>[];
  supabaseUrls: string[];
} {
  const secrets = new Map<string, Located<SecretHit>>();
  const jwts = new Map<string, Located<SupabaseJwt>>();
  const env = new Map<string, Located<EnvHit>>();
  const urls = new Set<string>();
  let inline = 0;
  for (const script of scripts) {
    const where = scriptLabel(script, script.url ? 0 : inline++);
    for (const hit of findSecrets(script.text)) if (!secrets.has(hit.raw)) secrets.set(hit.raw, { hit, where });
    for (const hit of findSupabaseJwts(script.text)) if (!jwts.has(hit.raw)) jwts.set(hit.raw, { hit, where });
    for (const hit of findEnvSecrets(script.text)) if (!env.has(`${hit.name}=${hit.raw}`)) env.set(`${hit.name}=${hit.raw}`, { hit, where });
    for (const url of findSupabaseUrls(script.text)) urls.add(url);
  }
  return { secrets: [...secrets.values()], jwts: [...jwts.values()], env: [...env.values()], supabaseUrls: [...urls] };
}

function capped(lines: string[]): string[] {
  return lines.length > MAX_EVIDENCE ? [...lines.slice(0, MAX_EVIDENCE), `…and ${lines.length - MAX_EVIDENCE} more`] : lines;
}

function scopeNote(snapshot: PageSnapshot): string {
  const kb = Math.round(snapshot.scripts.reduce((sum, s) => sum + s.bytes, 0) / 1024);
  const truncated = snapshot.scripts.filter((s) => s.truncated).length;
  return `${snapshot.scripts.length} script(s), ${kb} KB${truncated ? `, ${truncated} cut at the size limit` : ''}`;
}

export function checkServiceRole(scan: ReturnType<typeof scanScripts>, snapshot: PageSnapshot): Outcome {
  const service = scan.jwts.filter((j) => j.hit.role === 'service_role');
  const real = service.filter((j) => !j.hit.localDefault);
  if (real.length > 0) {
    return {
      status: 'fail',
      critical: true,
      why: `A Supabase service_role key is in the page's JavaScript. Anyone can use it to bypass Row Level Security on project ${real[0]?.hit.ref ?? '(unknown ref)'}.`,
      evidence: capped(real.map((j) => `${j.where}: ${j.hit.masked}`)),
    };
  }
  if (service.length > 0) {
    return {
      status: 'warn',
      why: 'The bundle contains the Supabase CLI local-dev service_role key. It does not unlock a hosted project, but it shows client code is built to use the admin key.',
      fix: 'Remove the service_role client from browser code before you switch it to real project keys.',
      evidence: capped(service.map((j) => `${j.where}: ${j.hit.masked}`)),
    };
  }
  return { status: 'pass', why: `No service_role JWT in ${scopeNote(snapshot)}.` };
}

export function checkSecretKeys(scan: ReturnType<typeof scanScripts>, snapshot: PageSnapshot): Outcome {
  if (scan.secrets.length === 0) return { status: 'pass', why: `No secret API keys in ${scopeNote(snapshot)}.` };
  const labels = [...new Set(scan.secrets.map((s) => s.hit.label))];
  return {
    status: 'fail',
    critical: scan.secrets.some((s) => s.hit.critical),
    why: `Found ${scan.secrets.length} secret key(s) in public scripts: ${labels.join(', ')}.`,
    evidence: capped(scan.secrets.map((s) => `${s.where}: ${s.hit.label}, ${s.hit.masked}`)),
  };
}

export function checkEnvSecrets(scan: ReturnType<typeof scanScripts>, snapshot: PageSnapshot): Outcome {
  if (scan.env.length === 0) return { status: 'pass', why: `No secret-named env variables with values in ${scopeNote(snapshot)}.` };
  return {
    status: 'fail',
    why: `${scan.env.length} secret-looking variable(s) were built into the client: ${[...new Set(scan.env.map((e) => e.hit.name))].slice(0, 4).join(', ')}.`,
    evidence: capped(scan.env.map((e) => `${e.where}: ${e.hit.name} = ${e.hit.masked}`)),
  };
}

export function checkSourceMaps(snapshot: PageSnapshot): Outcome {
  const exposed = snapshot.sourceMaps.filter((m) => m.exposed);
  if (exposed.length === 0) {
    const probed = snapshot.sourceMaps.length;
    return { status: 'pass', why: probed ? `${probed} referenced source map(s) are not publicly readable.` : 'No public source maps found next to the scripts that were checked.' };
  }
  const withSource = exposed.filter((m) => m.hasSourcesContent).length;
  return {
    status: 'warn',
    why: `${exposed.length} source map(s) are public${withSource ? `, ${withSource} with the full original source inside` : ''}.`,
    evidence: capped(exposed.map((m) => `${new URL(m.scriptUrl).pathname} → ${m.via === 'inline' ? 'inline data: URL' : new URL(m.mapUrl).pathname}`)),
  };
}

export function checkSupabaseConfig(scan: ReturnType<typeof scanScripts>): Outcome {
  const publicKeys = scan.jwts.filter((j) => j.hit.role === 'anon');
  const publishable = scan.supabaseUrls.length > 0 || publicKeys.length > 0;
  if (!publishable) return { status: 'skip', why: 'No Supabase project URL or anon key in the scripts.' };
  const refs = [...new Set([...scan.supabaseUrls.map((u) => new URL(u).hostname.split('.')[0]), ...publicKeys.map((j) => j.hit.ref).filter(Boolean)])];
  return {
    status: 'info',
    why: `This app talks to Supabase project ${refs.join(', ') || '(unknown ref)'}${publicKeys.length ? ' with an anon key' : ''}. The URL and anon key are public by design; the data is only safe if Row Level Security is on, which a browser cannot see.`,
    evidence: capped([...scan.supabaseUrls, ...publicKeys.map((j) => `${j.where}: ${j.hit.masked}`)]),
  };
}
