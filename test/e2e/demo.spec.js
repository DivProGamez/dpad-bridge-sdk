// End-to-end checks of the before/after demo in a real browser (headless Chromium).
// No real TV remote, Fire TV device or gamepad is involved: keys are synthesized
// by Playwright, the same way a TV browser delivers remote D-pad keys as keydown.
import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const focused = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.dpad-focus');
    return el ? el.id || el.textContent.trim() : null;
  });
const active = (page) => page.evaluate(() => document.activeElement && document.activeElement.id);
const ringCount = (page) => page.evaluate(() => document.querySelectorAll('.dpad-focus').length);

test.describe('BEFORE: the original mouse-first app', () => {
  test('arrow keys and Enter do nothing; cards are unreachable by keyboard', async ({ page }) => {
    await page.goto('/examples/tv-demo/');
    await expect(page.locator('#mode-badge')).toContainText('BEFORE');
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowDown', 'Enter']) await page.keyboard.press(key);
    expect(await ringCount(page)).toBe(0);
    await expect(page.locator('#recipe-dialog')).not.toHaveAttribute('open', '');
    // Tab never lands on a recipe card (they are plain <div>s).
    const tabbed = [];
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      tabbed.push(await page.evaluate(() => document.activeElement.className));
    }
    expect(tabbed.some((c) => /\bcard\b/.test(c))).toBe(false);
  });
});

test.describe('AFTER: the same DOM with DPadBridge mounted', () => {
  test('the toggle mounts the SDK with exactly one visible, really-focused element', async ({ page }) => {
    await page.goto('/examples/tv-demo/');
    await page.click('#dpad-toggle');
    await expect(page.locator('#mode-badge')).toContainText('AFTER');
    expect(await ringCount(page)).toBe(1);
    expect(await focused(page)).toBe('Home');
    const outline = await page.evaluate(() => getComputedStyle(document.querySelector('.dpad-focus')).outlineStyle);
    expect(outline).toBe('solid');
  });

  test('D-pad moves through the real layout: menu → cards → list and back', async ({ page }) => {
    await page.goto('/examples/tv-demo/?dpad=on');
    const path = [];
    for (const key of ['ArrowDown', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft']) {
      await page.keyboard.press(key);
      path.push(await focused(page));
      expect(await ringCount(page)).toBe(1);
    }
    expect(path.slice(0, 6)).toEqual([
      'card-harira',
      'card-shakshuka',
      'card-tagine',
      'card-msemen',
      'card-chebakia',
      path[5], // a shopping-list checkbox level with the card
    ]);
    expect(path[5]).toMatch(/^item-\d+$/);
    expect(path[6]).toBe('card-chebakia'); // group memory brings us back to the same card
    expect(await active(page)).toBe('card-chebakia'); // native focus follows the ring
  });

  test('edges keep focus (no diagonal jump into the list panel)', async ({ page }) => {
    await page.goto('/examples/tv-demo/?dpad=on');
    await page.evaluate(() => window.__demo.bridge.focus('#card-chebakia'));
    await page.keyboard.press('ArrowDown');
    expect(await focused(page)).toBe('card-chebakia');
    await expect(page.locator('#log')).toContainText('Edge reached');
  });

  test('OK opens the dialog, focus is contained, Back closes it and restores the card', async ({ page }) => {
    await page.goto('/examples/tv-demo/?dpad=on');
    await page.evaluate(() => window.__demo.bridge.focus('#card-tagine'));
    await page.keyboard.press('Enter');
    await expect(page.locator('#recipe-dialog')).toHaveAttribute('open', '');
    await expect(page.locator('#dialog-title')).toHaveText('Chicken tagine');
    expect(await focused(page)).toBe('start-cooking');
    for (const key of ['ArrowUp', 'ArrowLeft', 'ArrowDown']) await page.keyboard.press(key);
    expect(await page.evaluate(() => document.getElementById('recipe-dialog').contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('#recipe-dialog')).not.toHaveAttribute('open', '');
    expect(await focused(page)).toBe('card-tagine');
    expect(await active(page)).toBe('card-tagine');
    await expect(page.locator('#log')).toContainText('focus restored');
  });

  test('Enter activates exactly once per press (no native + synthetic double click)', async ({ page }) => {
    await page.goto('/examples/tv-demo/?dpad=on');
    await page.evaluate(() => window.__demo.bridge.focus('#card-salad'));
    await page.keyboard.press('Enter');
    await expect(page.locator('#start-count')).toHaveText('0');
    expect(await focused(page)).toBe('start-cooking');
    await page.keyboard.press('Enter');
    await expect(page.locator('#start-count')).toHaveText('1');
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await expect(page.locator('#start-count')).toHaveText('2');
    // Holding Enter (auto-repeat) must not machine-gun activations.
    await page.waitForTimeout(200);
    await page.keyboard.down('Enter');
    for (let i = 0; i < 5; i += 1) await page.keyboard.down('Enter'); // repeat=true events
    await page.keyboard.up('Enter');
    await expect(page.locator('#start-count')).toHaveText('3');
  });

  test('a long list scrolls inside its panel to reveal the focused row', async ({ page }) => {
    await page.goto('/examples/tv-demo/?dpad=on');
    await page.evaluate(() => window.__demo.bridge.focus('#item-0'));
    const list = page.locator('#list');
    expect(await list.evaluate((el) => el.scrollTop)).toBe(0);
    for (let i = 0; i < 25; i += 1) await page.keyboard.press('ArrowDown');
    expect(await focused(page)).toBe('item-25');
    await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(200);
    // The focused row ends up fully inside the list's visible box.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const l = document.getElementById('list').getBoundingClientRect();
          const r = document.getElementById('item-25').getBoundingClientRect();
          return r.top >= l.top && r.bottom <= l.bottom;
        }),
      )
      .toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.locator('#item-25')).toBeChecked();
    await expect(page.locator('#list-count')).toHaveText('1 / 30');
  });

  test('typing in the search box is not hijacked, and filtering re-wires navigation', async ({ page }) => {
    await page.goto('/examples/tv-demo/?dpad=on');
    await page.evaluate(() => window.__demo.bridge.focus('#search'));
    await page.keyboard.type('so');
    await expect(page.locator('#search')).toHaveValue('so');
    await page.keyboard.press('ArrowLeft'); // caret moves inside the text
    expect(await focused(page)).toBe('search');
    await page.keyboard.press('Backspace'); // deletes a character, it is not "Back"
    await expect(page.locator('#search')).toHaveValue('o');
    await page.keyboard.press('End');
    await page.keyboard.type('up');
    await expect(page.locator('#search')).toHaveValue('oup');
    // Only "Harira soup" matches; the observer refreshed the targets.
    await expect(page.locator('.card:not([hidden])')).toHaveCount(1);
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => focused(page)).not.toBe('search');
    await page.evaluate(() => window.__demo.bridge.focus('#card-harira'));
    await page.keyboard.press('ArrowRight');
    expect(await focused(page)).not.toMatch(/^card-/); // hidden cards are skipped
  });

  test('filter chips hide cards and navigation skips the hidden ones', async ({ page }) => {
    await page.goto('/examples/tv-demo/?dpad=on');
    await page.evaluate(() => window.__demo.bridge.focus('.chip[data-filter="sweet"]'));
    await page.keyboard.press('Enter');
    await expect(page.locator('.card:not([hidden])')).toHaveCount(1);
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => focused(page)).toBe('card-chebakia');
  });

  test('toggling off destroys everything: no ring, no listeners reacting', async ({ page }) => {
    await page.goto('/examples/tv-demo/?dpad=on');
    await page.keyboard.press('ArrowDown');
    await page.click('#dpad-toggle');
    await expect(page.locator('#mode-badge')).toContainText('BEFORE');
    expect(await ringCount(page)).toBe(0);
    expect(await page.evaluate(() => document.querySelectorAll('style[data-dpad-bridge-style]').length)).toBe(0);
    expect(await page.evaluate(() => document.querySelector('#card-harira').hasAttribute('tabindex'))).toBe(false);
    // Move native focus off the (still focused) toggle button so Enter cannot re-click it.
    await page.evaluate(() => document.activeElement.blur());
    const before = await active(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    expect(await ringCount(page)).toBe(0);
    expect(await active(page)).toBe(before);
    await expect(page.locator('#recipe-dialog')).not.toHaveAttribute('open', '');
  });

  test('prefers-reduced-motion: focus scrolling is instant', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    await page.goto('/examples/tv-demo/?dpad=on');
    await page.evaluate(() => window.__demo.bridge.focus('#item-0'));
    for (let i = 0; i < 20; i += 1) await page.keyboard.press('ArrowDown');
    // Read synchronously right after the last key: no smooth animation pending.
    const visible = await page.evaluate(() => {
      const l = document.getElementById('list').getBoundingClientRect();
      const r = document.getElementById('item-20').getBoundingClientRect();
      return r.top >= l.top && r.bottom <= l.bottom;
    });
    expect(visible).toBe(true);
    await context.close();
  });
});

test.describe('Saffron Kitchen features (real state, D-pad driven)', () => {
  test('"Add to shopping list" really adds the missing ingredients to the list', async ({ page }) => {
    await page.goto('/examples/tv-demo/?dpad=on');
    await expect(page.locator('#list-count')).toHaveText('0 / 30');
    await page.evaluate(() => window.__demo.bridge.focus('#card-salad'));
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowRight'); // Start cooking -> Add to shopping list
    expect(await focused(page)).toBe('add-to-list');
    await page.keyboard.press('Enter');
    await expect(page.locator('#list-feedback')).toHaveText('Added 1 new item');
    await expect(page.locator('#list-count')).toHaveText('0 / 31');
    await expect(page.locator('#list li.is-new .name')).toHaveText(['Mint']);
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter'); // again: no duplicates
    await expect(page.locator('#list-count')).toHaveText('0 / 31');
  });

  test('favorites: the dialog heart toggles state, the card shows it, the Favorites view filters', async ({ page }) => {
    await page.goto('/examples/tv-demo/?dpad=on');
    await page.evaluate(() => window.__demo.bridge.focus('#card-harira'));
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowUp'); // Start cooking -> heart (top right)
    expect(await focused(page)).toBe('fav-button');
    await page.keyboard.press('Enter');
    await expect(page.locator('#fav-button')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    expect(await focused(page)).toBe('card-harira');
    await expect(page.locator('#card-harira')).toHaveClass(/is-fav/);
    await page.evaluate(() => window.__demo.bridge.focus('.menu-link[data-view="favorites"]'));
    await page.keyboard.press('Enter');
    await expect(page.locator('.card:not([hidden])')).toHaveCount(1);
    await expect(page.locator('#section-name')).toHaveText('Your favorites');
    await page.keyboard.press('ArrowDown'); // menu -> the chip row sitting between menu and grid
    await expect.poll(() => focused(page)).toBe('All');
    await page.keyboard.press('ArrowDown'); // chips -> the only remaining card (grid panel lies below)
    await expect.poll(() => focused(page)).toBe('card-harira');
  });

  test('the Shopping list menu item jumps to the first item still to buy', async ({ page }) => {
    await page.goto('/examples/tv-demo/?dpad=on');
    await page.locator('#item-0').check();
    await page.evaluate(() => window.__demo.bridge.focus('.menu-link[data-view="list"]'));
    await page.keyboard.press('Enter');
    await expect.poll(() => focused(page)).toBe('item-1');
  });

  test('developer view lists the live SDK events', async ({ page }) => {
    await page.goto('/examples/tv-demo/');
    await expect(page.locator('#event-state')).toHaveText('(not mounted)');
    await page.click('#dpad-toggle');
    await page.click('#devview summary');
    await page.evaluate(() => window.__demo.bridge.focus('#card-shakshuka'));
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#event-list li').first()).toHaveText(/Focused: “Harira soup” · moved right/);
    await expect(page.locator('#event-state')).toHaveText('(listening)');
  });

  test('mocked Gamepad API drives the real poller in Chromium (no physical controller)', async ({ page }) => {
    await page.addInitScript(() => {
      const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
      const pad = { id: 'mock', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons };
      window.__pad = {
        press(i) { buttons[i].pressed = true; buttons[i].value = 1; },
        release(i) { buttons[i].pressed = false; buttons[i].value = 0; },
      };
      navigator.getGamepads = () => [pad, null, null, null];
    });
    await page.goto('/examples/tv-demo/?dpad=on');
    await page.evaluate(() => window.__demo.bridge.focus('#card-shakshuka'));
    await page.evaluate(() => window.dispatchEvent(new Event('gamepadconnected')));
    await page.evaluate(() => window.__pad.press(15)); // D-pad right
    await expect.poll(() => focused(page)).toBe('card-harira');
    await page.evaluate(() => window.__pad.release(15));
    await page.waitForTimeout(100);
    await page.evaluate(() => window.__pad.press(0)); // A = OK
    await expect(page.locator('#recipe-dialog')).toHaveAttribute('open', '');
    await page.evaluate(() => window.__pad.release(0));
    await page.waitForTimeout(100);
    await page.evaluate(() => window.__pad.press(1)); // B = Back
    await expect(page.locator('#recipe-dialog')).not.toHaveAttribute('open', '');
    await page.evaluate(() => window.__pad.release(1));
    expect(await focused(page)).toBe('card-harira');
  });
});

test.describe('minimal example', () => {
  test('works straight from disk (file://) with the IIFE build', async ({ page }) => {
    const file = pathToFileURL(path.resolve('examples/minimal/index.html')).href;
    await page.goto(file);
    expect(await focused(page)).toBe('Play');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await focused(page)).toBe('Settings');
    await page.keyboard.press('ArrowRight'); // the disabled button next to it is never focused
    expect(await focused(page)).not.toBe('Disabled (skipped)');
    expect(await page.evaluate(() => document.querySelector('button[disabled]').matches('.dpad-focus, :focus'))).toBe(false);
    await page.evaluate(() => document.querySelector('button').focus()); // back to "Play"
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('#out')).toHaveText(/Activated: Tile \d/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#out')).toHaveText('Back pressed');
  });
});
