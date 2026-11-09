import { defineConfig } from 'wxt';

// `E2E=1` builds a test-only copy into .output-e2e: it may script http://127.0.0.1 pages without the
// toolbar click that grants activeTab. Store builds never set it (test/manifest.test.ts checks the output).
const e2e = process.env.E2E === '1';

// One source, two targets: `wxt build` (Chrome/Edge MV3) and `wxt build -b firefox --mv3`.
export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  outDir: e2e ? '.output-e2e' : '.output',
  manifest: ({ browser }) => ({
    name: 'Launch Check',
    description:
      'Pre-launch check for the site in the current tab: SEO tags, security headers, mixed content and leaked API keys in its scripts.',
    // activeTab: access to the current tab only after you click the toolbar button.
    // scripting: run the read-only collector in that tab. No host permissions, no background network.
    permissions: ['activeTab', 'scripting'],
    ...(e2e && { host_permissions: ['http://127.0.0.1/*'] }),
    action: { default_title: 'Launch Check' },
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'launch-check@atokim4.github.io',
          strict_min_version: '142.0',
          // AMO's built-in data consent: this extension collects nothing.
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
  vite: () => ({
    esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
    define: { __E2E__: JSON.stringify(e2e) },
  }),
});
