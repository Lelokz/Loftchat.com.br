// Fotografa as propostas: node design/layouts/foto.mjs proposta-a [proposta-b ...]
import { chromium } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const pasta = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const nome of process.argv.slice(2)) {
  await page.goto('file://' + join(pasta, nome + '.html'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(pasta, nome + '.png') });
}
await browser.close();
