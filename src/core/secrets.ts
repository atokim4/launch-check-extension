/**
 * Passive secret detection over text the browser already downloaded. Nothing here makes a request or tries a key.
 * Every value that leaves this module is masked, so a copied report never spreads the secret further.
 */

export type SecretKind =
  | 'stripe-secret'
  | 'stripe-restricted'
  | 'stripe-webhook'
  | 'supabase-secret'
  | 'openai'
  | 'anthropic'
  | 'aws-access-key'
  | 'github-token';

export interface SecretHit {
  kind: SecretKind;
  label: string;
  critical: boolean;
  masked: string;
  /** Unmasked value, only for de-duplication inside the scanner. Never rendered. */
  raw: string;
}

export interface SupabaseJwt {
  role: string;
  ref: string | null;
  issuer: string | null;
  /** The Supabase CLI ships the same keys for every local stack (issuer "supabase-demo"). */
  localDefault: boolean;
  masked: string;
  raw: string;
}

export interface EnvHit {
  name: string;
  masked: string;
  raw: string;
}

interface Pattern {
  kind: SecretKind;
  regex: RegExp;
  label: (match: string) => string;
  critical: (match: string) => boolean;
}

const PATTERNS: Pattern[] = [
  {
    kind: 'stripe-secret',
    regex: /\bsk_(?:live|test)_[A-Za-z0-9]{10,}/g,
    label: (m) => (m.includes('_live_') ? 'Stripe live secret key' : 'Stripe test secret key'),
    critical: (m) => m.includes('_live_'),
  },
  {
    kind: 'stripe-restricted',
    regex: /\brk_(?:live|test)_[A-Za-z0-9]{10,}/g,
    label: (m) => (m.includes('_live_') ? 'Stripe live restricted key' : 'Stripe test restricted key'),
    critical: (m) => m.includes('_live_'),
  },
  { kind: 'stripe-webhook', regex: /\bwhsec_[A-Za-z0-9]{20,}/g, label: () => 'Stripe webhook signing secret', critical: () => true },
  { kind: 'supabase-secret', regex: /\bsb_secret_[A-Za-z0-9_-]{16,}/g, label: () => 'Supabase secret key', critical: () => true },
  { kind: 'anthropic', regex: /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{32,}/g, label: () => 'Anthropic API key', critical: () => true },
  {
    // Project, service-account and admin keys, plus the older 48-character format. Hyphenated CSS class names do not match.
    kind: 'openai',
    regex: /\bsk-(?:(?:proj|svcacct|admin)-[A-Za-z0-9_-]{40,}|[A-Za-z0-9]{48})(?![A-Za-z0-9_-])/g,
    label: () => 'OpenAI API key',
    critical: () => true,
  },
  { kind: 'aws-access-key', regex: /\bAKIA[0-9A-Z]{16}\b/g, label: () => 'AWS access key ID', critical: () => false },
  {
    kind: 'github-token',
    regex: /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,})\b/g,
    label: () => 'GitHub token',
    critical: () => true,
  },
];

/** `sk_live_51Ab…9xYz (107 chars)`: enough to find it in your code, useless to anyone else. */
export function mask(value: string, keep = 8): string {
  if (value.length <= keep + 4) return `${value.slice(0, 3)}… (${value.length} chars)`;
  return `${value.slice(0, keep)}…${value.slice(-4)} (${value.length} chars)`;
}

export function findSecrets(text: string): SecretHit[] {
  const hits: SecretHit[] = [];
  const seen = new Set<string>();
  for (const pattern of PATTERNS) {
    for (const match of text.matchAll(pattern.regex)) {
      const raw = match[0];
      if (seen.has(raw)) continue;
      seen.add(raw);
      hits.push({ kind: pattern.kind, label: pattern.label(raw), critical: pattern.critical(raw), masked: mask(raw), raw });
    }
  }
  return hits;
}

function decodeBase64Url(segment: string): string | null {
  try {
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;

/** Supabase API keys are JWTs with `role` (anon or service_role) and usually `iss: "supabase"` and the project `ref`. */
export function findSupabaseJwts(text: string): SupabaseJwt[] {
  const out: SupabaseJwt[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(JWT)) {
    const raw = match[0];
    const json = decodeBase64Url(match[1] ?? '');
    if (!json || seen.has(raw)) continue;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(json) as Record<string, unknown>;
    } catch {
      continue;
    }
    const issuer = typeof payload.iss === 'string' ? payload.iss : null;
    const role = typeof payload.role === 'string' ? payload.role : null;
    const ref = typeof payload.ref === 'string' ? payload.ref : null;
    const looksSupabase = (issuer?.includes('supabase') ?? false) || (ref !== null && role !== null);
    if (!looksSupabase || !role) continue;
    seen.add(raw);
    out.push({
      role,
      ref,
      issuer,
      localDefault: issuer === 'supabase-demo',
      masked: `${mask(raw, 12)}, role=${role}${ref ? `, ref=${ref}` : ''}`,
      raw,
    });
  }
  return out;
}

export function findSupabaseUrls(text: string): string[] {
  return [...new Set([...text.matchAll(/\bhttps:\/\/([a-z0-9]{20})\.supabase\.(?:co|in)\b/g)].map((m) => m[0]))];
}

const PUBLIC_PREFIX = '(?:VITE_|NEXT_PUBLIC_|REACT_APP_|EXPO_PUBLIC_|NUXT_PUBLIC_|PUBLIC_|GATSBY_)';
const SECRET_SUFFIX = '(?:SECRET(?:_KEY)?|PASSWORD|PASSWD|PRIVATE_KEY|SERVICE_ROLE(?:_KEY)?|SERVICE_KEY|ADMIN_KEY|WEBHOOK_SECRET)';
const AI_OR_PAYMENT = '(?:OPENAI|ANTHROPIC|CLAUDE|GEMINI|GROQ|MISTRAL|DEEPSEEK|PERPLEXITY|ELEVENLABS|REPLICATE|RESEND|SENDGRID|TWILIO|STRIPE_SECRET)';
const VALUE = String.raw`\s*[:=]\s*["'\x60]([^"'\x60\s]{6,})["'\x60]`;

const ENV_SECRET = new RegExp(String.raw`["']?\b(${PUBLIC_PREFIX}?[A-Z][A-Z0-9_]*${SECRET_SUFFIX})\b["']?` + VALUE, 'g');
/** A public-prefixed key for a paid API is a leak even without a scary suffix: VITE_OPENAI_API_KEY ships to every visitor. */
const ENV_PUBLIC_PAID = new RegExp(String.raw`["']?\b(${PUBLIC_PREFIX}[A-Z0-9_]*${AI_OR_PAYMENT}[A-Z0-9_]*(?:KEY|TOKEN))\b["']?` + VALUE, 'g');
const PLACEHOLDER = /^(?:your|xxx|changeme|example|placeholder|undefined|null|true|false|process\.env|import\.meta)|^<.*>$|^\*+$/i;

export function findEnvSecrets(text: string): EnvHit[] {
  const out: EnvHit[] = [];
  const seen = new Set<string>();
  for (const regex of [ENV_SECRET, ENV_PUBLIC_PAID]) {
    for (const match of text.matchAll(regex)) {
      const name = match[1] ?? '';
      const raw = match[2] ?? '';
      if (PLACEHOLDER.test(raw) || seen.has(`${name}=${raw}`)) continue;
      seen.add(`${name}=${raw}`);
      out.push({ name, masked: mask(raw, 4), raw });
    }
  }
  return out;
}
