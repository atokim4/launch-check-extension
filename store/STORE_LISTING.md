# Store listing: Launch Check

Same text for Firefox Add-ons (AMO) and Microsoft Edge Add-ons. Only what the extension does.

## Name
Launch Check

## Summary (AMO, max 250 chars; Edge short description)
Pre-launch check for the site in the current tab: SEO and sharing tags, security headers, mixed content, and API keys left in the page's own JavaScript. Runs only when you click it.

## Description
Launch Check is for the site you are about to put live. Open it in a tab, click the toolbar button, and you get a score out of 100 with a list of what to fix.

What it looks at:
- Keys in the page's own scripts: Supabase service_role keys (decoded locally, flagged as critical), Supabase secret keys, Stripe secret and restricted keys, Stripe webhook secrets, OpenAI and Anthropic keys, GitHub tokens, and secret .env values that a build tool bundled by mistake.
- Public source maps that expose your original code.
- Security headers: HTTPS, HSTS, Content-Security-Policy, clickjacking protection, nosniff, Referrer-Policy, and mixed content.
- Search and sharing: title, meta description, canonical URL, Open Graph, Twitter/X card, robots.txt, sitemap, favicon, html lang, mobile viewport.

Each problem comes with a short explanation and a fix, with snippets for nginx, Netlify, Vercel and Next.js where they apply. Keys are always shown masked. "Copy as Markdown" copies the full report for an issue or a pull request.

What it does not do:
- It never contacts Supabase, Stripe, OpenAI or any other service, and never tests whether a key works. It only reads what the site already sends to the browser.
- It only requests files from the site you are checking (the page, robots.txt, the sitemap, its own scripts and source maps).
- No analytics, no tracking, no account, no background activity. Results are not saved.

Permissions: "activeTab" (the current tab, only after you click the button) and "scripting" (to run the read-only check in that tab). No access to other sites.

Limits: up to 60 scripts and 15 MB per check; scripts from other domains are skipped. It cannot see your database rules, so a clean result does not prove your Supabase RLS policies are correct.

Open source (MIT): https://github.com/atokim4/launch-check-extension

## Category
- AMO: Web Development
- Edge: Developer tools

## Tags (AMO)
seo, security, developer tools, supabase, stripe

## Support / homepage
https://github.com/atokim4/launch-check-extension (issues)

## Privacy
- Privacy policy: PRIVACY.md (paste its text; AMO and Edge both have a field for it)
- AMO data collection: none (`data_collection_permissions: none` in the manifest)
- Edge "does this extension collect personal data": No

## Images
- Icon: public/icon/128.png (Edge also accepts 300x300; the 128 is the extension icon)
- Screenshot 1280x800: store/promo-1280x800.png
- Small promo tile 440x280 (Edge): store/tile-440x280.png
- Extra screenshots for AMO only (popup, 800x1200; Edge accepts only 1280x800 or 640x400): docs/screenshots/popup-leaky-dark.png, docs/screenshots/popup-good-light.png

## Packages
- Edge: .output/launch-check-extension-<version>-chrome.zip
- AMO: .output/launch-check-extension-<version>-firefox.zip plus the sources zip (the code is bundled by Vite, so AMO asks for sources). Build steps for the reviewer: `npm ci && npm run build:firefox` with Node 22.

## Notes for reviewers
The popup runs one function in the active tab with scripting.executeScript. That function reads the DOM and fetches same-origin URLs only. The only warning from web-ext lint is an innerHTML assignment inside the Preact runtime; the extension's own code does not use innerHTML.
