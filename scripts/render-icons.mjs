// Renders assets/icon.svg to the PNG sizes the stores and browsers want: node scripts/render-icons.mjs
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const SIZES = [16, 32, 48, 96, 128];
const svg = await readFile(new URL('../assets/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  for (const size of SIZES) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    await page.screenshot({ path: `public/icon/${size}.png`, omitBackground: true });
  }
  console.log(`icons: ${SIZES.join(', ')}`);
} finally {
  await browser.close();
}
