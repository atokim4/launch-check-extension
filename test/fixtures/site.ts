import { ANON_JWT, keyLookalikeClass, openAiKey, SERVICE_JWT, stripeKey, SUPABASE_URL } from './keys';

export interface FakeResponse {
  status?: number;
  headers?: Record<string, string>;
  body: string;
  /** Never answers; the request only ends when the collector aborts it. */
  hang?: boolean;
}
/** Path → response for one fake origin. Sample data only. */
export type FakeSite = Record<string, FakeResponse>;

export const ORIGIN = 'https://app.example.test';

const SECURE_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'content-security-policy': "default-src 'self'; frame-ancestors 'none'; base-uri 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

export const GOOD_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sample Bikes · Repair booking demo</title>
  <meta name="description" content="Sample page for tests: book a bike repair online and pay when you pick it up.">
  <link rel="canonical" href="${ORIGIN}/">
  <link rel="icon" href="/favicon.svg">
  <meta property="og:title" content="Sample Bikes">
  <meta property="og:description" content="Book a bike repair online.">
  <meta property="og:image" content="${ORIGIN}/og.png">
  <meta name="twitter:card" content="summary_large_image">
  <script type="module" src="/assets/app.js"></script>
  <script src="https://cdn.other.test/widget.js"></script>
</head>
<body><h1>Sample Bikes</h1><img src="/hero.webp" alt=""></body>
</html>`;

export function goodSite(): FakeSite {
  return {
    '/': { headers: SECURE_HEADERS, body: GOOD_HTML },
    '/robots.txt': { headers: { 'content-type': 'text/plain' }, body: `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n` },
    '/sitemap.xml': {
      headers: { 'content-type': 'application/xml' },
      body: `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${ORIGIN}/</loc></url></urlset>`,
    },
    '/assets/app.js': {
      headers: { 'content-type': 'text/javascript' },
      // Public values only: Supabase URL + anon key, a Stripe publishable key, and a CSS class that starts with "sk-".
      body: `const db=createClient("${SUPABASE_URL}","${ANON_JWT}");const pk="${stripeKey('pk', 'live')}";const spinner="${keyLookalikeClass()}";\n//# sourceMappingURL=app.js.map`,
    },
  };
}

export const LEAKY_HTML = `<!doctype html>
<html>
<head>
  <title>App</title>
  <script type="module" src="/assets/index-Bx81.js"></script>
  <script src="http://cdn.insecure.test/analytics.js"></script>
</head>
<body><div id="root"></div><img src="http://images.insecure.test/logo.png"></body>
</html>`;

const SPA_FALLBACK = '<!doctype html><html><div id="root"></div></html>';

export function leakySite(): FakeSite {
  const env = JSON.stringify({
    BASE_URL: '/',
    MODE: 'production',
    VITE_SUPABASE_URL: SUPABASE_URL,
    VITE_SUPABASE_SERVICE_ROLE_KEY: SERVICE_JWT,
    VITE_OPENAI_API_KEY: openAiKey(),
    VITE_ADMIN_PASSWORD: 'sample-admin-pass',
  });
  return {
    '/': { headers: { 'content-type': 'text/html' }, body: LEAKY_HTML },
    '/robots.txt': { headers: { 'content-type': 'text/html' }, body: SPA_FALLBACK },
    '/sitemap.xml': { headers: { 'content-type': 'text/html' }, body: SPA_FALLBACK },
    '/assets/index-Bx81.js': {
      headers: { 'content-type': 'text/javascript' },
      body: `var e=${env};const stripe="${stripeKey('sk', 'live')}";\n//# sourceMappingURL=index-Bx81.js.map`,
    },
    '/assets/index-Bx81.js.map': {
      headers: { 'content-type': 'application/json' },
      body: '{"version":3,"file":"index-Bx81.js","sources":["../src/main.tsx"],"sourcesContent":["// sample source"],"mappings":"AAAA"}',
    },
  };
}
