// Captures real screenshots of the demo with headless Chromium (Playwright).
//   npm run screenshots   -> docs/screenshots/*.png
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = (name) => path.join(root, 'docs/screenshots', name);
const PORT = 4321;

const server = spawn(process.execPath, [path.join(root, 'scripts/serve.mjs'), '--port', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const url = `http://127.0.0.1:${PORT}/examples/tv-demo/`;

  await page.goto(url);
  await page.keyboard.press('ArrowRight'); // does nothing: mouse-first original
  await page.screenshot({ path: out('1-before.png') });

  await page.goto(`${url}?dpad=on`);
  for (const k of ['ArrowDown', 'ArrowDown']) await page.keyboard.press(k);
  await page.waitForTimeout(250);
  await page.screenshot({ path: out('2-after-focus.png') });

  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  await page.screenshot({ path: out('3-after-dialog.png') });

  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__demo.bridge.focus('#item-0'));
  for (let i = 0; i < 22; i += 1) await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(600);
  await page.screenshot({ path: out('4-after-list-scroll.png') });
  console.log('screenshots written to docs/screenshots/');
} finally {
  await browser.close();
  server.kill();
}
