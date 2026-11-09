/**
 * Fake credentials for tests, assembled at runtime so no key-shaped literal sits in the repo
 * (secret scanners and GitHub push protection would flag it). None of these values is a real key.
 */
const b64url = (value: string): string => Buffer.from(value).toString('base64url');

export function fakeJwt(payload: Record<string, unknown>): string {
  return [b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), b64url(JSON.stringify(payload)), b64url('not-a-real-signature-for-tests')].join('.');
}

export const PROJECT_REF = 'abcdefghijklmnopqrst';
export const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
export const ANON_JWT = fakeJwt({ iss: 'supabase', ref: PROJECT_REF, role: 'anon', iat: 1730000000, exp: 2045000000 });
export const SERVICE_JWT = fakeJwt({ iss: 'supabase', ref: PROJECT_REF, role: 'service_role', iat: 1730000000, exp: 2045000000 });
export const DEMO_SERVICE_JWT = fakeJwt({ iss: 'supabase-demo', role: 'service_role', exp: 1983812996 });

const ALPHABET = 'aB0cD1eF2gH3';
/** Deterministic mixed-case filler of length n. */
export const filler = (n: number): string => Array.from({ length: n }, (_, i) => ALPHABET[i % ALPHABET.length]).join('');

export const stripeKey = (kind: 'sk' | 'rk' | 'pk', mode: 'live' | 'test'): string => [kind, mode, filler(40)].join('_');
export const webhookSecret = (): string => ['whsec', filler(32)].join('_');
export const supabaseSecret = (): string => ['sb', 'secret', filler(28)].join('_');
export const openAiKey = (): string => ['sk', 'proj', filler(80)].join('-');
export const anthropicKey = (): string => ['sk', 'ant', 'api03', filler(60)].join('-');
export const githubToken = (): string => ['ghp', filler(36)].join('_');
/** A CSS class name that starts with `sk-` and must not be reported as an OpenAI key. */
export const keyLookalikeClass = (): string => ['sk', 'fading', 'circle', 'container', 'element', 'wrapper', 'x1'].join('-');
