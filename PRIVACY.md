# Privacy policy: Launch Check

Last updated: 9 November 2026

Launch Check does not collect, store, sell or send any personal data or browsing data.

**What happens when you click the toolbar button.** The extension reads the page in the current tab (its tags,
links and scripts) and makes a few GET requests to that same website: the page URL (to read the response
headers), `robots.txt`, the sitemap, `favicon.ico` when the page links no icon, the site's own JavaScript files and
their source maps. These requests go from the page itself, the same way the page loads its own files. The results
are shown in the popup and are gone when the popup closes.

**What it never does.** It makes no requests to any other server, including Supabase, Stripe, OpenAI or the
author. It has no analytics, no tracking, no accounts and no remote code. It does not run in the background or on
any tab you did not click it on. It does not save results.

**Clipboard.** "Copy as Markdown" and the snippet "Copy" buttons write text to your clipboard when you click them.
The extension never reads the clipboard.

**Link.** The footer links to a paid audit offer on a freelance marketplace. Opening it is your choice and that
site has its own privacy policy.

Questions: open an issue at https://github.com/atokim4/launch-check-extension/issues
