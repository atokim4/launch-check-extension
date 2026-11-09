import { describe, expect, it } from 'vitest';
import { findEnvSecrets, findSecrets, findSupabaseJwts, findSupabaseUrls, mask } from '../src/core/secrets';
import * as keys from './fixtures/keys';

describe('findSecrets', () => {
  it('finds each supported secret format and labels it', () => {
    const text = [
      keys.stripeKey('sk', 'live'),
      keys.stripeKey('sk', 'test'),
      keys.stripeKey('rk', 'live'),
      keys.webhookSecret(),
      keys.supabaseSecret(),
      keys.openAiKey(),
      keys.anthropicKey(),
      keys.githubToken(),
    ]
      .map((k, i) => `const k${i}="${k}";`)
      .join('\n');
    const hits = findSecrets(text);
    expect(hits.map((h) => h.label)).toEqual([
      'Stripe live secret key',
      'Stripe test secret key',
      'Stripe live restricted key',
      'Stripe webhook signing secret',
      'Supabase secret key',
      'Anthropic API key',
      'OpenAI API key',
      'GitHub token',
    ]);
    expect(hits.find((h) => h.label === 'Stripe test secret key')?.critical).toBe(false);
    expect(hits.find((h) => h.label === 'Stripe live secret key')?.critical).toBe(true);
  });

  it('does not report an Anthropic key a second time as an OpenAI key', () => {
    expect(findSecrets(keys.anthropicKey()).map((h) => h.kind)).toEqual(['anthropic']);
  });

  it('ignores publishable keys and look-alike strings', () => {
    const text = `"${keys.stripeKey('pk', 'live')}" "${keys.keyLookalikeClass()}" "risk_test_mode" "sk-short"`;
    expect(findSecrets(text)).toEqual([]);
  });

  it('counts a repeated key once', () => {
    const key = keys.stripeKey('sk', 'live');
    expect(findSecrets(`${key} ${key} ${key}`)).toHaveLength(1);
  });
});

describe('mask', () => {
  it('keeps a recognisable prefix and suffix and never the middle', () => {
    const key = keys.stripeKey('sk', 'live');
    const masked = mask(key);
    expect(masked).toBe(`${key.slice(0, 8)}…${key.slice(-4)} (${key.length} chars)`);
    expect(masked).not.toContain(key.slice(8, -4));
  });

  it('shows almost nothing of a short value', () => {
    expect(mask('abcdefgh')).toBe('abc… (8 chars)');
  });
});

describe('findSupabaseJwts', () => {
  it('decodes role and project ref locally', () => {
    const [service, anon] = findSupabaseJwts(`a="${keys.SERVICE_JWT}";b="${keys.ANON_JWT}"`);
    expect(service).toMatchObject({ role: 'service_role', ref: keys.PROJECT_REF, localDefault: false });
    expect(anon).toMatchObject({ role: 'anon', ref: keys.PROJECT_REF });
    expect(service?.masked).not.toContain(keys.SERVICE_JWT);
  });

  it('marks the Supabase CLI local-dev key as a local default', () => {
    expect(findSupabaseJwts(keys.DEMO_SERVICE_JWT)[0]).toMatchObject({ role: 'service_role', localDefault: true });
  });

  it('ignores JWTs that are not Supabase API keys, and broken payloads', () => {
    expect(findSupabaseJwts(keys.fakeJwt({ sub: 'user-1', iss: 'https://auth.example.test', role: 'admin' }))).toEqual([]);
    const brokenPayload = keys.SERVICE_JWT.replace(/\.[^.]+\./, `.${Buffer.from('{"role":').toString('base64url')}xxxxxxxxxx.`);
    expect(findSupabaseJwts(brokenPayload)).toEqual([]);
  });
});

describe('findSupabaseUrls', () => {
  it('finds project URLs once each', () => {
    expect(findSupabaseUrls(`${keys.SUPABASE_URL}/rest/v1 ${keys.SUPABASE_URL}/auth/v1 https://supabase.com/docs`)).toEqual([keys.SUPABASE_URL]);
  });
});

describe('findEnvSecrets', () => {
  it('finds secret-named variables in an inlined env object', () => {
    const blob = JSON.stringify({
      VITE_SUPABASE_URL: keys.SUPABASE_URL,
      VITE_ADMIN_PASSWORD: 'sample-admin-pass',
      STRIPE_WEBHOOK_SECRET: 'sample-webhook-value',
      MODE: 'production',
    });
    expect(findEnvSecrets(blob).map((h) => h.name).sort()).toEqual(['STRIPE_WEBHOOK_SECRET', 'VITE_ADMIN_PASSWORD']);
  });

  it('flags a public-prefixed key for a paid API even without a secret suffix', () => {
    expect(findEnvSecrets(`VITE_OPENAI_API_KEY:"${keys.filler(30)}"`).map((h) => h.name)).toEqual(['VITE_OPENAI_API_KEY']);
  });

  it('handles KEY=value lines and skips placeholders', () => {
    const env = 'DB_PASSWORD="sample-db-pass"\nAPI_SECRET="your-secret-here"\nJWT_SECRET="<set me>"\nVITE_MAPS_API_KEY="public-maps-value"';
    expect(findEnvSecrets(env).map((h) => h.name)).toEqual(['DB_PASSWORD']);
  });

  it('masks the value', () => {
    const [hit] = findEnvSecrets('VITE_ADMIN_PASSWORD:"sample-admin-pass"');
    expect(hit?.masked).toBe('samp…pass (17 chars)');
  });
});
