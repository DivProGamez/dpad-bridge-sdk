// Focus-reachability audit and guided cooking, on the running demo in headless
// Chromium, at 1920x1080 and 1280x720. Only real keyboard input (Playwright
// keyboard.press) is used to navigate and activate. The graph-discovery step uses
// bridge.focus() solely to *place* focus before pressing a real arrow key; every
// reachability claim is then re-checked by replaying the arrow-key path from a
// fresh page load with keystrokes only.
import { test, expect } from '@playwright/test';

const KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

/** A stable name for the focused control. */
const focusedKey = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.dpad-focus');
    if (!el) return null;
    if (el.id) return `#${el.id}`;
    if (el.dataset.view) return `.menu-link[data-view="${el.dataset.view}"]`;
    if (el.dataset.filter) return `.chip[data-filter="${el.dataset.filter}"]`;
    if (el.tagName === 'SUMMARY') return '#devview summary';
    return el.tagName;
  });

async function settle(page) {
  await page.waitForTimeout(40);
}

/** Map every focusable control to its neighbour per arrow key (real key presses). */
async function discover(page, start, inScope) {
  const edges = new Map();
  const queue = [start];
  const seen = new Set([start]);
  while (queue.length) {
    const node = queue.shift();
    const out = {};
    for (const key of KEYS) {
      await page.evaluate((sel) => window.__demo.bridge.focus(sel), node);
      await page.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: 'nearest' }), node);
      await settle(page);
      await page.keyboard.press(key);
      await settle(page);
      const to = await focusedKey(page);
      out[key] = to;
      if (to && inScope(to) && !seen.has(to)) {
        seen.add(to);
        queue.push(to);
      }
    }
    edges.set(node, out);
  }
  return edges;
}

/** Shortest arrow-key path from start to every node. */
function paths(edges, start) {
  const result = new Map([[start, []]]);
  const queue = [start];
  while (queue.length) {
    const node = queue.shift();
    for (const [key, to] of Object.entries(edges.get(node) || {})) {
      if (to && edges.has(to) && !result.has(to)) {
        result.set(to, [...result.get(node), key]);
        queue.push(to);
      }
    }
  }
  return result;
}

const MAIN_REQUIRED = [
  '.menu-link[data-view="all"]', '.menu-link[data-view="favorites"]', '.menu-link[data-view="list"]',
  '#search', '#dpad-toggle',
  '.chip[data-filter="all"]', '.chip[data-filter="quick"]', '.chip[data-filter="veg"]', '.chip[data-filter="sweet"]',
  '#card-shakshuka', '#card-harira', '#card-salad', '#card-tagine', '#card-msemen', '#card-chebakia',
  ...Array.from({ length: 30 }, (_, i) => `#item-${i}`),
  '#devview summary',
];

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test('every visible control on the main screen is reachable with arrow keys from Home', async ({ page }) => {
      test.setTimeout(240_000);
      await page.goto('/examples/tv-demo/');
      const start = '.menu-link[data-view="all"]';
      expect(await focusedKey(page)).toBe(start);
      const edges = await discover(page, start, (k) => !k.startsWith('#recipe') && k !== '#fav-button');
      const reach = paths(edges, start);
      const missing = MAIN_REQUIRED.filter((k) => !reach.has(k));
      expect(missing, 'unreachable controls').toEqual([]);

      // Replay each path from a fresh load using keystrokes only.
      for (const target of MAIN_REQUIRED) {
        await page.goto('/examples/tv-demo/');
        for (const key of reach.get(target)) {
          await page.keyboard.press(key);
          await settle(page);
        }
        await expect.poll(() => focusedKey(page), { message: `replay to ${target}` }).toBe(target);
        // Focused element is really focused and inside the viewport (scrolled into view).
        const ok = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          const r = el.getBoundingClientRect();
          return document.activeElement === el && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
        }, target);
        expect(ok, `${target} focused and visible`).toBe(true);
      }
    });

    test('every recipe-dialog and cooking control is reachable and contained', async ({ page }) => {
      await page.goto('/examples/tv-demo/');
      await page.keyboard.press('ArrowDown'); // Home -> Harira card
      await page.keyboard.press('Enter');
      await expect(page.locator('#recipe-dialog')).toHaveAttribute('open', '');
      const dialogEdges = await discover(page, '#start-cooking', () => true);
      const reach = paths(dialogEdges, '#start-cooking');
      for (const k of ['#fav-button', '#start-cooking', '#add-to-list', '#close-dialog']) expect(reach.has(k), k).toBe(true);
      for (const [, out] of dialogEdges) {
        for (const to of Object.values(out)) {
          expect(await page.evaluate((sel) => document.getElementById('recipe-dialog').contains(document.querySelector(sel)), to)).toBe(true);
        }
      }

      // Cooking controls, by keyboard only.
      await page.evaluate(() => window.__demo.bridge.focus('#start-cooking'));
      await page.keyboard.press('Enter');
      await expect(page.locator('#cook-progress-text')).toHaveText('Step 1 of 5');
      expect(await focusedKey(page)).toBe('#cook-next');
      await page.keyboard.press('Enter');
      await expect(page.locator('#cook-progress-text')).toHaveText('Step 2 of 5');
      await page.keyboard.press('ArrowLeft');
      expect(await focusedKey(page)).toBe('#cook-prev');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      expect(await focusedKey(page)).toBe('#cook-exit');
      await page.keyboard.press('ArrowUp');
      expect(await focusedKey(page)).toBe('#fav-button'); // heart stays reachable while cooking
    });

    test('Start cooking runs a real guided flow: steps, Previous, Next, Finish, exit; Esc restores focus', async ({ page }) => {
      await page.goto('/examples/tv-demo/');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown'); // Msemen card
      expect(await focusedKey(page)).toBe('#card-msemen');
      await page.keyboard.press('Enter');
      expect(await focusedKey(page)).toBe('#start-cooking');
      await page.keyboard.press('Enter');
      await expect(page.locator('#start-count')).toHaveText('1');
      await expect(page.locator('#cook-panel')).toBeVisible();
      await expect(page.locator('#recipe-info')).toBeHidden();
      await expect(page.locator('#cook-label')).toHaveText('Cooking · Msemen flatbread');
      await expect(page.locator('#cook-step')).toHaveText(/semolina/);
      await expect(page.locator('#cook-prev')).toBeDisabled();
      const steps = [];
      for (let i = 0; i < 4; i += 1) {
        steps.push(await page.locator('#cook-progress-text').textContent());
        await page.waitForTimeout(200); // human pace (the SDK ignores a 2nd OK within 150 ms)
        await page.keyboard.press('Enter');
      }
      expect(steps).toEqual(['Step 1 of 5', 'Step 2 of 5', 'Step 3 of 5', 'Step 4 of 5']);
      await expect(page.locator('#cook-progress-text')).toHaveText('Step 5 of 5');
      expect(await focusedKey(page)).toBe('#cook-finish'); // Next became Finish; focus followed
      await expect(page.locator('#cook-bar')).toHaveAttribute('aria-valuenow', '100');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('Enter'); // Previous
      await expect(page.locator('#cook-progress-text')).toHaveText('Step 4 of 5');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);
      await page.keyboard.press('Enter'); // Next -> step 5
      await page.waitForTimeout(200);
      await page.keyboard.press('Enter'); // Finish
      await expect(page.locator('#cook-step')).toHaveText('Finished! Enjoy your msemen flatbread.');
      expect(await focusedKey(page)).toBe('#cook-exit');
      await page.keyboard.press('Enter'); // Back to recipe
      await expect(page.locator('#recipe-info')).toBeVisible();
      expect(await focusedKey(page)).toBe('#start-cooking');
      // Esc in the middle of cooking also gets out: dialog closes, focus back on the card.
      await page.waitForTimeout(200);
      await page.keyboard.press('Enter');
      await expect(page.locator('#cook-panel')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#recipe-dialog')).not.toHaveAttribute('open', '');
      expect(await focusedKey(page)).toBe('#card-msemen');
      await page.keyboard.press('Enter'); // reopening starts at the recipe, not mid-cooking
      await expect(page.locator('#recipe-info')).toBeVisible();
      await expect(page.locator('#cook-panel')).toBeHidden();
    });
  });
}

test('filtering never traps focus: chips -> remaining card -> list and back', async ({ page }) => {
  await page.goto('/examples/tv-demo/');
  await page.keyboard.press('ArrowDown'); // card
  await page.keyboard.press('ArrowUp'); // chips row
  expect(await focusedKey(page)).toMatch(/^\.chip/);
  for (let i = 0; i < 4 && (await focusedKey(page)) !== '.chip[data-filter="sweet"]'; i += 1) await page.keyboard.press('ArrowRight');
  expect(await focusedKey(page)).toBe('.chip[data-filter="sweet"]');
  await page.keyboard.press('Enter');
  await expect(page.locator('.card:not([hidden])')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => focusedKey(page)).toBe('#card-chebakia');
  await page.keyboard.press('ArrowRight');
  expect(await focusedKey(page)).toMatch(/^#item-\d+$/);
  await page.keyboard.press('ArrowLeft');
  expect(await focusedKey(page)).toBe('#card-chebakia');
  await page.keyboard.press('ArrowUp'); // leaves the grid upwards (whatever lines up above it)
  const above = await focusedKey(page);
  expect(above).not.toBe('#card-chebakia');
  expect(above).toMatch(/^\.(chip|menu-link)/);
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => focusedKey(page)).toBe('#card-chebakia'); // and comes back: no trap
});

test('the DPadBridge switch is reachable and activatable by keyboard, and BEFORE mode can be left', async ({ page }) => {
  await page.goto('/examples/tv-demo/');
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowRight'); // Home -> ... -> search -> switch
  expect(await focusedKey(page)).toBe('#dpad-toggle');
  await page.keyboard.press('Enter'); // turn OFF via OK
  await expect(page.locator('#mode-badge')).toContainText('BEFORE');
  await page.keyboard.press('ArrowLeft'); // BEFORE: arrows are intentionally inert
  expect(await page.evaluate(() => document.activeElement.id)).toBe('dpad-toggle');
  expect(await page.evaluate(() => document.querySelectorAll('.dpad-focus').length)).toBe(0);
  await page.keyboard.press('Enter'); // native button activation, no SDK involved
  await expect(page.locator('#mode-badge')).toContainText('AFTER');

  // From a fresh BEFORE page: Tab to the switch, or press "d".
  await page.goto('/examples/tv-demo/?dpad=off');
  let tabs = 0;
  while ((await page.evaluate(() => document.activeElement.id)) !== 'dpad-toggle' && tabs < 15) {
    await page.keyboard.press('Tab');
    tabs += 1;
  }
  expect(tabs).toBeLessThan(15);
  await page.keyboard.press('Enter');
  await expect(page.locator('#mode-badge')).toContainText('AFTER');
  await page.goto('/examples/tv-demo/?dpad=off');
  await page.keyboard.press('d');
  await expect(page.locator('#mode-badge')).toContainText('AFTER');
});

test('real mouse still works for everything, including the cooking flow', async ({ page }) => {
  await page.goto('/examples/tv-demo/');
  await page.click('#card-tagine');
  await expect(page.locator('#recipe-dialog')).toHaveAttribute('open', '');
  await page.click('#start-cooking');
  await expect(page.locator('#cook-progress-text')).toHaveText('Step 1 of 5');
  await page.click('#cook-next');
  await expect(page.locator('#cook-progress-text')).toHaveText('Step 2 of 5');
  await page.click('#cook-prev');
  await expect(page.locator('#cook-progress-text')).toHaveText('Step 1 of 5');
  await page.click('#cook-exit');
  await expect(page.locator('#recipe-info')).toBeVisible();
  await page.click('#fav-button');
  await expect(page.locator('#fav-button')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#close-dialog');
  await expect(page.locator('#recipe-dialog')).not.toHaveAttribute('open', '');
  await page.click('#item-3');
  await expect(page.locator('#item-3')).toBeChecked();
  await page.click('#dpad-toggle');
  await expect(page.locator('#mode-badge')).toContainText('BEFORE');
  await page.click('#card-salad'); // mouse works in BEFORE too
  await expect(page.locator('#recipe-dialog')).toHaveAttribute('open', '');
});
