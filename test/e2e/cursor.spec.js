// Navigation-on-by-default and the virtual cursor, tested on the running demo in
// headless Chromium. Remote D-pad keys are synthesized keydown events; gamepad input
// is SIMULATED with a mocked navigator.getGamepads() (no physical controller or TV).
import { test, expect } from '@playwright/test';

const focused = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.dpad-focus');
    return el ? el.id || el.textContent.trim() : null;
  });

/** Where the arrow tip is drawn on screen, and whether the overlay is visible. */
const cursor = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.dpad-cursor');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { visible: getComputedStyle(el).opacity === '1', tipX: r.left + 4, tipY: r.top + 2, host: el.parentElement.id || el.parentElement.tagName };
  });

/** Poll until the cursor tip sits on (or within 2px of) the element's box. */
async function expectCursorOn(page, selector) {
  await expect
    .poll(async () => {
      const c = await cursor(page);
      const r = await page.locator(selector).boundingBox();
      if (!c || !c.visible || !r) return false;
      return c.tipX >= r.x - 2 && c.tipX <= r.x + r.width + 2 && c.tipY >= r.y - 2 && c.tipY <= r.y + r.height + 2;
    }, { message: `virtual cursor on ${selector}` })
    .toBe(true);
}

const insideViewport = (page) =>
  page.evaluate(() => {
    const r = document.querySelector('.dpad-cursor').getBoundingClientRect();
    return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  });

test('fresh launch: navigation is ON and the virtual cursor is on the focused element', async ({ page }) => {
  await page.goto('/examples/tv-demo/');
  await expect(page.locator('#mode-badge')).toContainText('AFTER');
  await expect(page.locator('#dpad-toggle')).toHaveAttribute('aria-checked', 'true');
  expect(await focused(page)).toBe('Home');
  await expectCursorOn(page, '.menu-link[data-view="all"]');
});

test('ArrowDown visibly changes focus and the cursor follows; Enter/Escape open, close and restore', async ({ page }) => {
  await page.goto('/examples/tv-demo/');
  await page.keyboard.press('ArrowDown');
  expect(await focused(page)).toBe('card-harira');
  await expectCursorOn(page, '#card-harira');
  // The focused card keeps the saffron outline.
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.dpad-focus')).outlineStyle)).toBe('solid');

  await page.keyboard.press('Enter');
  await expect(page.locator('#recipe-dialog')).toHaveAttribute('open', '');
  expect(await focused(page)).toBe('start-cooking');
  await expectCursorOn(page, '#start-cooking');
  expect((await cursor(page)).host).toBe('recipe-dialog'); // drawn above the modal (top layer)
  await page.keyboard.press('ArrowRight');
  await expectCursorOn(page, '#add-to-list');

  await page.keyboard.press('Escape');
  await expect(page.locator('#recipe-dialog')).not.toHaveAttribute('open', '');
  expect(await focused(page)).toBe('card-harira');
  await expectCursorOn(page, '#card-harira');
  expect((await cursor(page)).host).toBe('BODY');
});

test('Enter activates exactly once and the cursor stays put', async ({ page }) => {
  await page.goto('/examples/tv-demo/');
  await page.evaluate(() => window.__demo.bridge.focus('#card-salad'));
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.locator('#start-count')).toHaveText('1');
  await expect(page.locator('#cook-progress-text')).toHaveText('Step 1 of 4');
  await expectCursorOn(page, '#cook-next');
});

test('scrolling: off-screen list rows are revealed and the cursor stays on them, inside the viewport', async ({ page }) => {
  await page.goto('/examples/tv-demo/');
  await page.evaluate(() => window.__demo.bridge.focus('#item-0'));
  for (let i = 0; i < 26; i += 1) await page.keyboard.press('ArrowDown');
  expect(await focused(page)).toBe('item-26');
  await expect.poll(() => page.locator('#list').evaluate((el) => el.scrollTop)).toBeGreaterThan(200);
  await expectCursorOn(page, '#item-26');
  expect(await insideViewport(page)).toBe(true);
});

test('mouse use hides the virtual cursor and restores the native one; controller input brings it back', async ({ page }) => {
  await page.goto('/examples/tv-demo/');
  await expectCursorOn(page, '.menu-link[data-view="all"]');
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.card')).cursor)).toBe('none');

  await page.mouse.move(300, 400);
  await page.mouse.move(420, 460, { steps: 4 });
  await expect.poll(async () => (await cursor(page)).visible).toBe(false);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.card')).cursor)).toBe('pointer');

  // Mouse clicks still work natively (and do not bring the virtual cursor back).
  await page.click('.chip[data-filter="veg"]');
  await expect(page.locator('.chip[data-filter="veg"]')).toHaveClass(/is-on/);
  expect((await cursor(page)).visible).toBe(false);

  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await cursor(page)).visible).toBe(true);
  const id = await focused(page);
  await expectCursorOn(page, `#${id}`);
});

test('SIMULATED gamepad: D-pad and left stick move focus and cursor; A opens, B closes', async ({ page }) => {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    const axes = [0, 0, 0, 0];
    const pad = { id: 'simulated', index: 0, connected: true, mapping: 'standard', axes, buttons };
    window.__pad = {
      press(i) { buttons[i].pressed = true; buttons[i].value = 1; },
      release(i) { buttons[i].pressed = false; buttons[i].value = 0; },
      stick(x, y) { axes[0] = x; axes[1] = y; },
    };
    navigator.getGamepads = () => [pad, null, null, null];
  });
  await page.goto('/examples/tv-demo/');
  await page.evaluate(() => window.__demo.bridge.focus('#card-shakshuka'));
  await page.mouse.move(10, 10);
  await page.mouse.move(60, 60, { steps: 3 }); // start in mouse mode: cursor hidden
  await expect.poll(async () => (await cursor(page)).visible).toBe(false);
  await page.evaluate(() => window.dispatchEvent(new Event('gamepadconnected')));

  await page.evaluate(() => window.__pad.press(15)); // D-pad right
  await expect.poll(() => focused(page)).toBe('card-harira');
  await page.evaluate(() => window.__pad.release(15));
  await expectCursorOn(page, '#card-harira'); // controller input shows it again

  await page.evaluate(() => window.__pad.stick(0, 0.9)); // left stick down
  await expect.poll(() => focused(page)).toBe('card-msemen');
  await page.evaluate(() => window.__pad.stick(0, 0));
  await expectCursorOn(page, '#card-msemen');

  await page.waitForTimeout(80);
  await page.evaluate(() => window.__pad.press(0)); // A
  await expect(page.locator('#recipe-dialog')).toHaveAttribute('open', '');
  await page.evaluate(() => window.__pad.release(0));
  await page.waitForTimeout(80);
  await page.evaluate(() => window.__pad.press(1)); // B
  await expect(page.locator('#recipe-dialog')).not.toHaveAttribute('open', '');
  await page.evaluate(() => window.__pad.release(1));
  expect(await focused(page)).toBe('card-msemen');
  await expectCursorOn(page, '#card-msemen');
});

test('full D-pad coverage: every area is reachable, typing is never intercepted', async ({ page }) => {
  await page.goto('/examples/tv-demo/');
  const press = async (key, times = 1) => {
    for (let i = 0; i < times; i += 1) await page.keyboard.press(key);
  };
  const at = async (expected) => {
    await expect.poll(() => focused(page)).toBe(expected);
    await expectCursorOn(page, `#${expected}`.replace(/^#(Home|Favorites|Shopping list|All|Under 20 min|Vegetarian|Dessert|Developer view)$/, '[data-x]'));
  };

  // Top navigation
  expect(await focused(page)).toBe('Home');
  await press('ArrowRight');
  expect(await focused(page)).toBe('Favorites');
  await press('ArrowRight');
  expect(await focused(page)).toBe('Shopping list');
  // Search field: typing goes into the field
  await press('ArrowRight');
  expect(await focused(page)).toBe('search');
  await page.keyboard.type('tag');
  await expect(page.locator('#search')).toHaveValue('tag');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(page.locator('#search')).toHaveValue('');
  // BEFORE/AFTER switch is reachable
  await press('ArrowRight');
  expect(await focused(page)).toBe('dpad-toggle');
  await expectCursorOn(page, '#dpad-toggle');

  // Filters
  await page.evaluate(() => window.__demo.bridge.focus('.chip[data-filter="all"]'));
  for (const label of ['Under 20 min', 'Vegetarian', 'Dessert']) {
    await press('ArrowRight');
    expect(await focused(page)).toBe(label);
  }

  // All six recipe cards
  await page.evaluate(() => window.__demo.bridge.focus('#card-shakshuka'));
  const seen = new Set([await focused(page)]);
  for (const key of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowLeft']) {
    await press(key);
    seen.add(await focused(page));
    await expectCursorOn(page, `#${await focused(page)}`);
  }
  expect([...seen].sort()).toEqual(['card-chebakia', 'card-harira', 'card-msemen', 'card-salad', 'card-shakshuka', 'card-tagine']);

  // Dialog: Start cooking, Add to shopping list, Close, Favorites
  await press('Enter');
  expect(await focused(page)).toBe('start-cooking');
  await press('ArrowRight');
  expect(await focused(page)).toBe('add-to-list');
  await press('ArrowRight');
  expect(await focused(page)).toBe('close-dialog');
  await page.evaluate(() => window.__demo.bridge.focus('#start-cooking'));
  await press('ArrowUp');
  expect(await focused(page)).toBe('fav-button');
  await expectCursorOn(page, '#fav-button');
  await press('ArrowLeft', 3); // contained: cannot leave the dialog
  expect(await page.evaluate(() => document.getElementById('recipe-dialog').contains(document.activeElement))).toBe(true);
  await press('Escape');
  expect(await focused(page)).toBe('card-tagine');

  // Shopping list checkboxes (long scrolling list)
  await page.evaluate(() => window.__demo.bridge.focus('#card-chebakia'));
  await press('ArrowRight');
  const item = await focused(page);
  expect(item).toMatch(/^item-\d+$/);
  await press('Enter');
  await expect(page.locator(`#${item}`)).toBeChecked();

  // Developer view
  await page.evaluate(() => window.__demo.bridge.focus('#item-29'));
  await expect.poll(() => page.evaluate(() => document.getElementById('item-29').getBoundingClientRect().bottom < innerHeight)).toBe(true);
  await press('ArrowDown');
  expect(await focused(page)).toBe('Developer view');
  await press('Enter');
  await expect(page.locator('#devview')).toHaveAttribute('open', '');
});
