// Captures real screenshots of the running demo with headless Chromium (Playwright).
//   npm run screenshots   -> docs/screenshots/*.png
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'docs/screenshots');
const out = (name) => path.join(dir, name);
const shot = (page, name) => page.screenshot({ path: out(name), type: 'jpeg', quality: 88 });
const PORT = 4321;
const url = `http://127.0.0.1:${PORT}/examples/tv-demo/`;

const server = spawn(process.execPath, [path.join(root, 'scripts/serve.mjs'), '--port', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
await rm(dir, { recursive: true, force: true });
await mkdir(dir, { recursive: true });

const browser = await chromium.launch();
const settle = (page) => page.evaluate(() => document.fonts.ready).then(() => page.waitForTimeout(450));
try {
  const hd = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  await hd.goto(`${url}?dpad=off`);
  await hd.keyboard.press('ArrowRight'); // does nothing: mouse-first original
  await settle(hd);
  await shot(hd, '1080p-1-home-before.jpg');

  await hd.goto(`${url}?dpad=on`);
  for (const k of ['ArrowDown', 'ArrowDown']) await hd.keyboard.press(k); // Home -> Harira -> Msemen
  await settle(hd);
  await shot(hd, '1080p-2-home-after.jpg');

  await hd.keyboard.press('Enter'); // open the focused recipe
  await settle(hd);
  await shot(hd, '1080p-3-dialog-after.jpg');

  await hd.keyboard.press('ArrowRight');
  await hd.keyboard.press('Enter'); // add to shopping list
  await hd.keyboard.press('Escape'); // close, focus returns to the card
  await hd.evaluate(() => { document.getElementById('devview').open = true; }); // keeps focus on the card
  await settle(hd);
  await shot(hd, '1080p-4-restored-devview.jpg');

  const sd = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await sd.goto(`${url}?dpad=on`);
  await sd.evaluate(() => window.__demo.bridge.focus('#item-0'));
  for (let i = 0; i < 22; i += 1) await sd.keyboard.press('ArrowDown');
  await settle(sd);
  await shot(sd, '720p-5-list-scroll.jpg');
  console.log('screenshots written to docs/screenshots/');
} finally {
  await browser.close();
  server.kill();
}
