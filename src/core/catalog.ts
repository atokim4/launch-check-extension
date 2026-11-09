import type { CheckCategory } from './types';

export interface CheckDefinition {
  id: string;
  title: string;
  category: CheckCategory;
  /** Share of the score. Leaked credentials weigh most, social tags least. */
  weight: number;
  /** Why the check matters, in plain words. */
  explanation: string;
  /** Default fix shown with a failed or warned check. */
  fix: string;
  /** Copy-paste examples for common hosts and frameworks. */
  snippets: { label: string; code: string }[];
}

const NGINX = 'nginx';
const NETLIFY = 'Netlify (_headers)';
const VERCEL = 'Vercel (vercel.json)';
const NEXT = 'Next.js (next.config.js headers())';

function headerSnippets(name: string, value: string): CheckDefinition['snippets'] {
  return [
    { label: NGINX, code: `add_header ${name} "${value}" always;` },
    { label: NETLIFY, code: `/*\n  ${name}: ${value}` },
    {
      label: VERCEL,
      code: JSON.stringify({ headers: [{ source: '/(.*)', headers: [{ key: name, value }] }] }, null, 2),
    },
    { label: NEXT, code: `{ source: '/(.*)', headers: [{ key: '${name}', value: "${value}" }] }` },
  ];
}

const CSP_VALUE = "default-src 'self'; img-src 'self' data: https:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'";
const HSTS_VALUE = 'max-age=31536000; includeSubDomains';

const PAGE_CHECKS: readonly CheckDefinition[] = [
  {
    id: 'https',
    title: 'Served over HTTPS',
    category: 'security',
    weight: 10,
    explanation:
      'Without HTTPS, anyone on the same network can read or change the page, and browsers label the site "Not secure".',
    fix: 'Get a free certificate (Let\'s Encrypt, or your host\'s built-in TLS) and serve the site on https://.',
    snippets: [{ label: 'certbot (nginx)', code: 'sudo certbot --nginx -d example.com -d www.example.com' }],
  },
  {
    id: 'hsts',
    title: 'Strict-Transport-Security (HSTS)',
    category: 'security',
    weight: 5,
    explanation: 'HSTS tells browsers to always use HTTPS for the domain, which stops downgrade attacks on later visits.',
    fix: `Send \`Strict-Transport-Security: ${HSTS_VALUE}\` on HTTPS responses.`,
    snippets: headerSnippets('Strict-Transport-Security', HSTS_VALUE),
  },
  {
    id: 'csp',
    title: 'Content-Security-Policy',
    category: 'security',
    weight: 5,
    explanation:
      'A CSP limits where scripts can load from and where data can be sent. It is the main second line of defence against XSS.',
    fix: 'Start with a strict policy in Content-Security-Policy-Report-Only, watch the reports, then enforce it.',
    snippets: headerSnippets('Content-Security-Policy', CSP_VALUE),
  },
  {
    id: 'frame-protection',
    title: 'Clickjacking protection',
    category: 'security',
    weight: 4,
    explanation:
      'If any site can put your page in an iframe, it can trick visitors into clicking buttons they cannot see.',
    fix: "Send `X-Frame-Options: DENY` or add `frame-ancestors 'self'` to the CSP.",
    snippets: headerSnippets('X-Frame-Options', 'DENY'),
  },
  {
    id: 'nosniff',
    title: 'X-Content-Type-Options: nosniff',
    category: 'security',
    weight: 3,
    explanation: 'Stops browsers from guessing file types, so an uploaded text file cannot be run as a script.',
    fix: 'Send `X-Content-Type-Options: nosniff` on every response.',
    snippets: headerSnippets('X-Content-Type-Options', 'nosniff'),
  },
  {
    id: 'referrer-policy',
    title: 'Referrer-Policy',
    category: 'security',
    weight: 2,
    explanation: 'Without it, full URLs (sometimes with tokens or search terms) are sent to every third-party site you link to.',
    fix: 'Send `Referrer-Policy: strict-origin-when-cross-origin`.',
    snippets: headerSnippets('Referrer-Policy', 'strict-origin-when-cross-origin'),
  },
  {
    id: 'mixed-content',
    title: 'No mixed content',
    category: 'security',
    weight: 5,
    explanation:
      'An HTTPS page that loads scripts or styles over http:// gets them blocked by the browser. Images over http:// show a warning.',
    fix: 'Change http:// asset URLs to https:// (or protocol-relative paths on your own domain).',
    snippets: [{ label: 'CSP stopgap', code: 'Content-Security-Policy: upgrade-insecure-requests' }],
  },
  {
    id: 'title',
    title: 'Page title',
    category: 'seo',
    weight: 5,
    explanation: 'The title is the blue link in search results and the tab label. 10 to 70 characters fits most results.',
    fix: 'Add a unique `<title>` of 10-70 characters that says what the page is.',
    snippets: [{ label: 'HTML', code: '<title>Acme Bikes · Bike repair in Tashkent</title>' }],
  },
  {
    id: 'meta-description',
    title: 'Meta description',
    category: 'seo',
    weight: 4,
    explanation: 'Search engines often show it under the title. Without one they pick a random sentence from the page.',
    fix: 'Add a 50-160 character `<meta name="description">` that sells the page.',
    snippets: [
      { label: 'HTML', code: '<meta name="description" content="Same-day bike repair and tune-ups. Book online, pay on pickup.">' },
    ],
  },
  {
    id: 'canonical',
    title: 'Canonical URL',
    category: 'seo',
    weight: 3,
    explanation: 'Tells search engines which URL is the real one when the same page is reachable at several addresses.',
    fix: 'Add `<link rel="canonical" href="https://example.com/page">` with the absolute preferred URL.',
    snippets: [{ label: 'HTML', code: '<link rel="canonical" href="https://example.com/">' }],
  },
  {
    id: 'open-graph',
    title: 'Open Graph tags',
    category: 'seo',
    weight: 3,
    explanation: 'og:title, og:description and og:image decide how the link looks when shared in chats and social apps.',
    fix: 'Add og:title, og:description and an absolute og:image (1200x630 works everywhere).',
    snippets: [
      {
        label: 'HTML',
        code: '<meta property="og:title" content="Acme Bikes">\n<meta property="og:description" content="Same-day bike repair.">\n<meta property="og:image" content="https://example.com/og.png">\n<meta property="og:url" content="https://example.com/">',
      },
    ],
  },
  {
    id: 'twitter-card',
    title: 'Twitter / X card',
    category: 'seo',
    weight: 1,
    explanation: 'Without twitter:card, links shared on X show as a plain URL instead of a preview card.',
    fix: 'Add `<meta name="twitter:card" content="summary_large_image">` (it reuses the og: tags).',
    snippets: [{ label: 'HTML', code: '<meta name="twitter:card" content="summary_large_image">' }],
  },
  {
    id: 'robots-txt',
    title: 'robots.txt',
    category: 'seo',
    weight: 3,
    explanation: 'Crawlers read /robots.txt first. A leftover `Disallow: /` from staging hides the whole site from search.',
    fix: 'Serve a /robots.txt that allows crawling and points at the sitemap.',
    snippets: [{ label: 'robots.txt', code: 'User-agent: *\nAllow: /\n\nSitemap: https://example.com/sitemap.xml' }],
  },
  {
    id: 'sitemap',
    title: 'XML sitemap',
    category: 'seo',
    weight: 2,
    explanation: 'A sitemap lists the pages you want indexed, which helps new sites get found faster.',
    fix: 'Generate /sitemap.xml (most frameworks have a plugin) and reference it in robots.txt.',
    snippets: [
      {
        label: 'sitemap.xml',
        code: '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://example.com/</loc></url>\n</urlset>',
      },
    ],
  },
  {
    id: 'favicon',
    title: 'Favicon',
    category: 'seo',
    weight: 1,
    explanation: 'Shown in tabs, bookmarks and some search results. A missing one also fills server logs with 404s.',
    fix: 'Add `<link rel="icon" href="/favicon.svg">` or put a favicon.ico at the site root.',
    snippets: [{ label: 'HTML', code: '<link rel="icon" href="/favicon.svg" type="image/svg+xml">' }],
  },
  {
    id: 'html-lang',
    title: 'Page language (html lang)',
    category: 'seo',
    weight: 2,
    explanation: 'Screen readers use it to pick a voice, and browsers use it to offer translation.',
    fix: 'Set the language on the root element, e.g. `<html lang="en">`.',
    snippets: [{ label: 'HTML', code: '<html lang="en">' }],
  },
  {
    id: 'viewport',
    title: 'Mobile viewport',
    category: 'seo',
    weight: 4,
    explanation: 'Without a viewport tag, phones render the page at desktop width and zoom out until the text is tiny.',
    fix: 'Add `<meta name="viewport" content="width=device-width, initial-scale=1">`.',
    snippets: [{ label: 'HTML', code: '<meta name="viewport" content="width=device-width, initial-scale=1">' }],
  },
];

const LEAK_CHECKS: readonly CheckDefinition[] = [
  {
    id: 'supabase-service-role',
    title: 'No Supabase service_role key in the browser',
    category: 'leaks',
    weight: 25,
    explanation:
      'The service_role key skips every Row Level Security policy. Anyone who opens DevTools can read, change or delete every row in the database.',
    fix: 'Rotate the key in the Supabase dashboard (Settings → API) now, then move the code that needs it to a server route or Edge Function. The browser only gets the anon or publishable key.',
    snippets: [
      {
        label: 'Edge Function (Deno)',
        code: "import { createClient } from 'npm:@supabase/supabase-js@2';\n\n// The secret stays on the server: set it with `supabase secrets set`.\nconst admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);",
      },
      { label: 'Vite .env', code: '# Only VITE_ variables reach the bundle. Never give the service key a VITE_ name.\nVITE_SUPABASE_URL=https://<project-ref>.supabase.co\nVITE_SUPABASE_ANON_KEY=<anon key>' },
    ],
  },
  {
    id: 'secret-keys',
    title: 'No secret API keys in scripts',
    category: 'leaks',
    weight: 25,
    explanation:
      'Secret keys for Stripe, Supabase (sb_secret_), OpenAI, Anthropic, AWS or GitHub in a public script can be copied and used by anyone, on your bill.',
    fix: 'Revoke and reissue each key shown here, then call that API from your server and send the browser only the result.',
    snippets: [
      {
        label: 'Next.js route handler',
        code: "// app/api/chat/route.ts runs on the server, so process.env.OPENAI_API_KEY never ships to the browser.\nexport async function POST(req: Request) {\n  const { prompt } = await req.json();\n  const res = await fetch('https://api.openai.com/v1/responses', {\n    method: 'POST',\n    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },\n    body: JSON.stringify({ model: process.env.OPENAI_MODEL, input: prompt }),\n  });\n  return Response.json(await res.json());\n}",
      },
    ],
  },
  {
    id: 'env-secrets',
    title: 'No secret env variables in the bundle',
    category: 'leaks',
    weight: 10,
    explanation:
      'Bundlers inline every VITE_, NEXT_PUBLIC_ or REACT_APP_ variable into the JavaScript. A name like *_SECRET, *_PASSWORD or *_SERVICE_ROLE_KEY with a value next to it means a server secret was built into the client.',
    fix: 'Rename the variable without the public prefix, read it only in server code, and rotate the value because it has already been published.',
    snippets: [{ label: '.env', code: '# public (bundled)\nVITE_API_URL=https://api.example.com\n# server only (no prefix, never imported in client code)\nPAYMENTS_SECRET=...' }],
  },
  {
    id: 'source-maps',
    title: 'Source maps not public',
    category: 'leaks',
    weight: 4,
    explanation:
      'A public .map file lets anyone read your original source code, comments included. That is fine for open-source apps, but it often reveals internal URLs, feature flags and old secrets.',
    fix: 'Build with hidden source maps and upload them to your error tracker instead of serving them, or block *.map on the host.',
    snippets: [
      { label: 'Vite', code: "// vite.config.ts\nexport default defineConfig({ build: { sourcemap: 'hidden' } });" },
      { label: 'Next.js', code: '// next.config.js\nmodule.exports = { productionBrowserSourceMaps: false };' },
      { label: NETLIFY, code: '/*.map\n  X-Robots-Tag: noindex\n# or remove the files in the build command: find dist -name "*.map" -delete' },
    ],
  },
  {
    id: 'supabase-public-config',
    title: 'Supabase project settings in the page',
    category: 'leaks',
    weight: 0,
    explanation:
      'The project URL and the anon (or publishable) key are public by design. They are only safe while Row Level Security is on for every table the anon role can reach.',
    fix: 'Check that RLS is enabled on every table in the public schema and that no policy is just `using (true)` for writes.',
    snippets: [
      { label: 'SQL (run in the Supabase SQL editor)', code: "select tablename from pg_tables where schemaname = 'public' and not rowsecurity;" },
    ],
  },
];

export const CATALOG: readonly CheckDefinition[] = [...LEAK_CHECKS, ...PAGE_CHECKS];

const BY_ID = new Map(CATALOG.map((c) => [c.id, c]));

export function definition(id: string): CheckDefinition {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`unknown check id: ${id}`);
  return def;
}
