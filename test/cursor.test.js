import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setup, gridHtml } from './helpers/dom.js';
import { createDPadBridge, cursorPoint } from '../src/index.js';
import { CURSOR_SIZE, CURSOR_TIP } from '../src/cursor.js';

function make(html, options = {}) {
  const env = setup(html);
  const bridge = createDPadBridge({
    root: env.document.body,
    scrollBehavior: 'auto',
    gamepad: false,
    virtualCursor: true,
    ...options,
  });
  return { ...env, bridge };
}

const cursorEl = (env) => env.document.querySelector('.dpad-cursor');
const pointer = (env, type, init) => {
  const ev = new env.window.PointerEvent(type, { bubbles: true, pointerType: 'mouse', ...init });
  env.document.body.dispatchEvent(ev);
};

describe('cursorPoint', () => {
  test('tip sits just inside the bottom-right corner of the target', () => {
    const p = cursorPoint({ left: 100, top: 100, right: 300, bottom: 200, width: 200, height: 100 }, { width: 1280, height: 720 });
    assert.deepEqual(p, { x: 286, y: 186 });
  });

  test('small targets get a proportional inset', () => {
    const p = cursorPoint({ left: 0, top: 0, right: 20, bottom: 20, width: 20, height: 20 }, { width: 1280, height: 720 });
    assert.deepEqual(p, { x: 17, y: 17 });
  });

  test('the whole pointer is clamped inside the viewport', () => {
    const p = cursorPoint({ left: 1200, top: 650, right: 1300, bottom: 760, width: 100, height: 110 }, { width: 1280, height: 720 });
    assert.equal(p.x, 1280 - (CURSOR_SIZE - CURSOR_TIP.x));
    assert.equal(p.y, 720 - (CURSOR_SIZE - CURSOR_TIP.y));
  });
});

describe('virtual cursor in the bridge', () => {
  test('is off by default (no overlay, no attribute)', () => {
    const env = setup(gridHtml(2, 1));
    const bridge = createDPadBridge({ root: env.document.body, gamepad: false }).mount();
    assert.equal(cursorEl(env), null);
    assert.equal(bridge.getCursor(), null);
    assert.equal(env.document.body.hasAttribute('data-dpad-input'), false);
  });

  test('mount shows it on the initially focused element', () => {
    const env = make(gridHtml(3, 1));
    env.bridge.mount();
    const c = env.bridge.getCursor();
    assert.equal(c.visible, true);
    assert.equal(c.target.id, 'c00');
    assert.deepEqual([c.x, c.y], [100 - 14, 60 - 9]); // 100x60 cell: insets 14 / 9
    assert.ok(cursorEl(env).classList.contains('is-visible'));
    assert.equal(env.document.body.getAttribute('data-dpad-input'), 'controller');
    assert.equal(cursorEl(env).getAttribute('aria-hidden'), 'true');
  });

  test('arrow keys move focus and the cursor together', () => {
    const env = make(gridHtml(3, 2));
    env.bridge.mount();
    env.press('ArrowRight');
    let c = env.bridge.getCursor();
    assert.equal(c.target.id, 'c01');
    assert.equal(env.bridge.getFocused().id, 'c01');
    assert.deepEqual([c.x, c.y], [120 + 100 - 14, 60 - 9]);
    env.press('ArrowDown');
    c = env.bridge.getCursor();
    assert.equal(c.target.id, 'c11');
    assert.deepEqual([c.x, c.y], [206, 80 + 60 - 9]);
    assert.match(cursorEl(env).style.transform, /translate\(202px, 129px\)/);
  });

  test('real mouse movement hides it; the next arrow key brings it back', () => {
    const env = make(gridHtml(3, 1));
    env.bridge.mount();
    pointer(env, 'pointermove', { clientX: 10, clientY: 10 });
    pointer(env, 'pointermove', { clientX: 60, clientY: 40 });
    assert.equal(env.bridge.getCursor().visible, false);
    assert.equal(env.document.body.hasAttribute('data-dpad-input'), false, 'native cursor restored');
    env.press('ArrowRight');
    assert.equal(env.bridge.getCursor().visible, true);
    assert.equal(env.bridge.getCursor().target.id, 'c01');
    assert.equal(env.document.body.getAttribute('data-dpad-input'), 'controller');
  });

  test('a zero-distance pointermove (layout shift under a still mouse) does not hide it', () => {
    const env = make(gridHtml(2, 1));
    env.bridge.mount();
    pointer(env, 'pointermove', { clientX: 10, clientY: 10 });
    pointer(env, 'pointermove', { clientX: 10, clientY: 10 });
    assert.equal(env.bridge.getCursor().visible, true);
  });

  test('a mouse click hides it, and mouse-driven focus does not re-show it', () => {
    const env = make(gridHtml(3, 1));
    env.bridge.mount();
    pointer(env, 'pointerdown', { clientX: 250, clientY: 20 });
    env.$('#c02').focus(); // what a click on a button does
    const c = env.bridge.getCursor();
    assert.equal(c.visible, false);
    assert.equal(c.target.id, 'c02', 'still tracks the focus so it reappears in the right place');
  });

  test('moves into an open modal (top layer) and back to <body> when it closes', () => {
    const env = make(`${gridHtml(2, 1)}
      <div id="modal" aria-modal="true" hidden>
        <button id="m1" data-rect="300,300,100,40">Play</button>
        <button id="close" data-dpad-close data-rect="420,300,100,40">Close</button>
      </div>`);
    env.$('#c00').addEventListener('click', () => (env.$('#modal').hidden = false));
    env.$('#close').addEventListener('click', () => (env.$('#modal').hidden = true));
    env.bridge.mount();
    env.press('Enter');
    assert.equal(cursorEl(env).parentNode.id, 'modal');
    assert.equal(env.bridge.getCursor().target.id, 'm1');
    env.press('Escape');
    assert.equal(cursorEl(env).parentNode, env.document.body);
    assert.equal(env.bridge.getCursor().target.id, 'c00');
  });

  test('destroy removes the overlay, its stylesheet, the attribute and every listener', () => {
    const env = setup(gridHtml(2, 1));
    const live = new Set();
    for (const target of [env.window, env.document]) {
      const add = target.addEventListener.bind(target);
      const remove = target.removeEventListener.bind(target);
      target.addEventListener = (t, fn, o) => (live.add(fn), add(t, fn, o));
      target.removeEventListener = (t, fn, o) => (live.delete(fn), remove(t, fn, o));
    }
    const bridge = createDPadBridge({ root: env.document.body, gamepad: false, virtualCursor: true }).mount();
    assert.ok(live.size >= 6);
    bridge.destroy();
    assert.equal(live.size, 0);
    assert.equal(env.document.querySelector('.dpad-cursor'), null);
    assert.equal(env.document.querySelector('style[data-dpad-cursor-style]'), null);
    assert.equal(env.document.body.hasAttribute('data-dpad-input'), false);
  });
});
