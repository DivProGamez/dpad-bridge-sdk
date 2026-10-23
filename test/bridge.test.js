import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setup, gridHtml } from './helpers/dom.js';
import { createDPadBridge } from '../src/index.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function make(html, options = {}) {
  const env = setup(html);
  const bridge = createDPadBridge({ root: env.document.body, scrollBehavior: 'auto', gamepad: false, ...options });
  return { ...env, bridge };
}

const focusedId = (env) => env.bridge.getFocused() && env.bridge.getFocused().id;

describe('mount and spatial navigation', () => {
  test('mount focuses the first target and marks exactly one element', () => {
    const env = make(gridHtml(3, 3));
    env.bridge.mount();
    assert.equal(focusedId(env), 'c00');
    assert.equal(env.document.activeElement.id, 'c00', 'real DOM focus, not just a class');
    assert.equal(env.$$('.dpad-focus').length, 1);
    assert.equal(env.document.body.getAttribute('data-dpad-bridge'), 'on');
    assert.ok(env.document.querySelector('style[data-dpad-bridge-style]'), 'focus theme injected');
  });

  test('arrow keys move through a grid and always keep one focused element', () => {
    const env = make(gridHtml(3, 3));
    env.bridge.mount();
    const seq = [];
    for (const key of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      const ev = env.press(key);
      assert.equal(ev.defaultPrevented, true, 'arrow keys do not scroll the page');
      seq.push(focusedId(env));
      assert.equal(env.$$('.dpad-focus').length, 1);
    }
    assert.deepEqual(seq, ['c01', 'c02', 'c12', 'c22', 'c21', 'c11']);
  });

  test('boundary: focus stays put and a boundary event fires', () => {
    const boundaries = [];
    const env = make(gridHtml(2, 1), { onBoundary: (e) => boundaries.push(e.direction) });
    env.bridge.mount();
    env.press('ArrowLeft');
    env.press('ArrowUp');
    assert.equal(focusedId(env), 'c00');
    assert.deepEqual(boundaries, ['left', 'up']);
    assert.equal(env.document.activeElement.id, 'c00', 'focus never falls back to <body>');
  });

  test('held arrow keys (auto-repeat) are throttled to repeatInterval', () => {
    let t = 0;
    const env = make(gridHtml(6, 1), { now: () => t, repeatInterval: 100 });
    env.bridge.mount();
    env.press('ArrowRight'); // first press always moves
    for (let i = 0; i < 6; i += 1) {
      t += 30; // browser key repeat every ~30ms
      const ev = env.press('ArrowRight', { repeat: true });
      assert.equal(ev.defaultPrevented, true, 'swallowed repeats still do not scroll the page');
    }
    // t = 30..180: repeats allowed at 30 (first), then >= 130 => 2 extra moves
    assert.equal(focusedId(env), 'c03');
  });

  test('initialFocus option and move() API', () => {
    const env = make(gridHtml(3, 1), { initialFocus: '#c02' });
    env.bridge.mount();
    assert.equal(focusedId(env), 'c02');
    assert.equal(env.bridge.move('left'), true);
    assert.equal(focusedId(env), 'c01');
    assert.throws(() => env.bridge.move('sideways'), TypeError);
  });

  test('explicit data-dpad-* overrides win over geometry; "none" blocks', () => {
    const env = make(`
      <button id="a" data-rect="0,0,100,40" data-dpad-right="#c" data-dpad-down="none">a</button>
      <button id="b" data-rect="110,0,100,40">b</button>
      <button id="c" data-rect="220,0,100,40">c</button>
      <button id="d" data-rect="0,60,100,40">d</button>`);
    env.bridge.mount();
    env.press('ArrowRight');
    assert.equal(focusedId(env), 'c');
    env.bridge.focus('#a');
    env.press('ArrowDown');
    assert.equal(focusedId(env), 'a');
  });

  test('groups keep navigation inside a panel and remember the last item on re-entry', () => {
    // Sidebar (x 0-200) and a content grid (x 260+). The sidebar's second item
    // sits level with grid row 2.
    const env = make(`
      <nav data-dpad-group>
        <button id="s1" data-rect="0,0,200,50">Home</button>
        <button id="s2" data-rect="0,120,200,50">Recipes</button>
      </nav>
      <main data-dpad-group>
        <button id="g1" data-rect="260,0,200,100">1</button>
        <button id="g2" data-rect="480,0,200,100">2</button>
        <button id="g3" data-rect="260,120,200,100">3</button>
        <button id="g4" data-rect="480,120,200,100">4</button>
      </main>`);
    env.bridge.mount();
    env.press('ArrowRight'); // s1 -> g1
    env.press('ArrowRight'); // g1 -> g2
    env.press('ArrowDown'); // g2 -> g4
    assert.equal(focusedId(env), 'g4');
    env.press('ArrowLeft'); // g4 -> g3 (same group first)
    env.press('ArrowLeft'); // leaves group -> sidebar, remembered item s1
    assert.equal(focusedId(env), 's1');
    env.press('ArrowRight'); // re-enter grid: remembered g3, not geometric g1
    assert.equal(focusedId(env), 'g3');
  });

  test('leaving a group never jumps diagonally into another panel', () => {
    // Bottom-right card of a grid; a list panel sits to the right and lower.
    const env = make(`
      <main data-dpad-group>
        <button id="g1" data-rect="0,0,200,100">1</button>
        <button id="g2" data-rect="220,0,200,100">2</button>
      </main>
      <aside data-dpad-group data-rect="460,0,200,200">
        <button id="l1" data-rect="460,40,200,40">a</button>
        <button id="l2" data-rect="460,140,200,40">b</button>
      </aside>`);
    env.bridge.mount();
    env.bridge.focus('#g2');
    env.press('ArrowDown');
    assert.equal(focusedId(env), 'g2', 'boundary instead of a diagonal jump to l2');
    env.press('ArrowRight');
    assert.equal(focusedId(env), 'l1', 'in-beam exit still works');
  });

  test('leaving a group reaches a panel that lies ahead even if its items are offset', () => {
    // A filter toolbar on the right above a grid whose only visible card is on the left.
    const env = make(`
      <div data-dpad-group data-rect="0,0,700,40">
        <button id="all" data-rect="400,0,80,40">All</button>
        <button id="dessert" data-rect="600,0,100,40">Dessert</button>
      </div>
      <main data-dpad-group data-rect="0,80,700,300">
        <button id="only" data-rect="0,80,220,140">Cookies</button>
      </main>`);
    env.bridge.mount();
    env.bridge.focus('#dessert');
    env.press('ArrowDown');
    assert.equal(focusedId(env), 'only');
  });

  test('native Tab / mouse focus is adopted, keeping tab semantics', () => {
    const env = make(gridHtml(3, 1));
    env.bridge.mount();
    env.$('#c02').focus(); // e.g. the user pressed Tab twice or clicked
    assert.equal(focusedId(env), 'c02');
    assert.equal(env.$$('.dpad-focus').length, 1);
    env.press('ArrowLeft');
    assert.equal(focusedId(env), 'c01');
  });

  test('non-native data-dpad-focusable cards get tabindex=0 (removed on destroy)', () => {
    const env = make(`<div id="card" data-dpad-focusable data-rect="0,0,100,100">card</div>
      <div id="own" data-dpad-focusable tabindex="3" data-rect="200,0,100,100">own</div>`);
    env.bridge.mount();
    assert.equal(env.$('#card').getAttribute('tabindex'), '0');
    env.bridge.destroy();
    assert.equal(env.$('#card').hasAttribute('tabindex'), false);
    assert.equal(env.$('#own').getAttribute('tabindex'), '3', 'app-defined tabindex untouched');
  });
});

describe('disabled / hidden targets during navigation', () => {
  test('skips elements disabled or hidden after mount without needing refresh', () => {
    const env = make(gridHtml(4, 1));
    env.bridge.mount();
    env.$('#c01').disabled = true;
    env.$('#c02').style.visibility = 'hidden';
    env.press('ArrowRight');
    assert.equal(focusedId(env), 'c03');
  });
});

describe('refresh and dynamic DOM', () => {
  test('new nodes become reachable after refresh()', () => {
    const env = make(gridHtml(2, 1));
    env.bridge.mount();
    env.press('ArrowRight');
    const extra = env.document.createElement('button');
    extra.id = 'new';
    extra.setAttribute('data-rect', '240,0,100,60');
    env.document.body.appendChild(extra);
    env.press('ArrowRight');
    assert.equal(focusedId(env), 'c01', 'not known before refresh');
    env.bridge.refresh();
    env.press('ArrowRight');
    assert.equal(focusedId(env), 'new');
  });

  test('removing the focused node re-homes focus to its nearest neighbour (no focus loss)', () => {
    const env = make(gridHtml(3, 3));
    env.bridge.mount();
    env.bridge.focus('#c11');
    env.$('#c11').remove();
    env.bridge.refresh();
    assert.ok(env.bridge.getFocused(), 'still focused on something');
    assert.notEqual(env.document.activeElement, env.document.body);
    assert.ok(['c01', 'c10', 'c12', 'c21'].includes(focusedId(env)), `nearest neighbour, got ${focusedId(env)}`);
  });

  test('pressing an arrow after the focused node vanished also re-homes without refresh', () => {
    const env = make(gridHtml(3, 1));
    env.bridge.mount();
    env.bridge.focus('#c01');
    env.$('#c01').hidden = true;
    env.press('ArrowRight');
    assert.ok(['c00', 'c02'].includes(focusedId(env)));
  });

  test('observe: true picks up added and removed nodes automatically', async () => {
    const env = make(gridHtml(2, 1), { observe: true });
    env.bridge.mount();
    const extra = env.document.createElement('button');
    extra.id = 'auto';
    extra.setAttribute('data-rect', '240,0,100,60');
    env.document.body.appendChild(extra);
    await tick();
    env.bridge.focus('#c01');
    env.press('ArrowRight');
    assert.equal(focusedId(env), 'auto');
    env.bridge.destroy();
  });

  test('observe: its own class/tabindex writes never trigger a refresh; app mutations do', async () => {
    const env = make(`${gridHtml(3, 1)}<div id="card" data-dpad-focusable data-rect="0,100,100,60">c</div>`, {
      observe: true,
    });
    env.bridge.mount();
    // Count target re-collections (the query that refresh() runs on the root).
    let collections = 0;
    const body = env.document.body;
    const original = body.querySelectorAll.bind(body);
    body.querySelectorAll = (sel) => {
      if (sel.includes('data-dpad-focusable')) collections += 1;
      return original(sel);
    };
    for (let i = 0; i < 6; i += 1) {
      env.press(i % 2 ? 'ArrowLeft' : 'ArrowRight');
      await tick();
    }
    env.press('ArrowDown'); // focuses the card that received tabindex=0
    await tick();
    assert.equal(collections, 0, 'focus class / tabindex writes are filtered out');
    env.$('#c02').classList.add('app-highlight');
    await tick();
    assert.equal(collections, 1, 'a genuine app change does refresh');
    env.bridge.destroy();
  });
});

describe('activation (OK / Enter)', () => {
  test('Enter activates the focused element exactly once via native click()', () => {
    const env = make(gridHtml(2, 1));
    let clicks = 0;
    env.$('#c00').addEventListener('click', () => (clicks += 1));
    env.bridge.mount();
    const ev = env.press('Enter');
    assert.equal(ev.defaultPrevented, true, 'native Enter activation suppressed so it cannot double fire');
    assert.equal(clicks, 1);
  });

  test('held Enter (key repeat) does not re-activate', () => {
    const env = make(gridHtml(1, 1));
    let clicks = 0;
    env.$('#c00').addEventListener('click', () => (clicks += 1));
    env.bridge.mount();
    env.press('Enter');
    env.press('Enter', { repeat: true });
    env.press('Enter', { repeat: true });
    assert.equal(clicks, 1);
  });

  test('keyboard + gamepad OK within the guard window activate once', () => {
    let t = 1000;
    const env = make(gridHtml(1, 1), { now: () => t });
    let clicks = 0;
    env.$('#c00').addEventListener('click', () => (clicks += 1));
    env.bridge.mount();
    env.press('Enter');
    t += 40;
    env.bridge.activate(); // e.g. gamepad A on the same frame burst
    assert.equal(clicks, 1);
    t += 500;
    env.bridge.activate();
    assert.equal(clicks, 2, 'a later deliberate press works');
  });

  test('div cards (mouse-first onclick) and checkboxes activate natively', () => {
    const env = make(`
      <div id="card" data-dpad-focusable data-rect="0,0,100,100">card</div>
      <input id="chk" type="checkbox" data-rect="200,0,20,20">`);
    let cardClicks = 0;
    env.$('#card').addEventListener('click', () => (cardClicks += 1));
    env.bridge.mount();
    env.press('Enter');
    assert.equal(cardClicks, 1);
    env.press('ArrowRight');
    env.press('Enter');
    assert.equal(env.$('#chk').checked, true);
  });

  test('activate event reports element and source', () => {
    const seen = [];
    const env = make(gridHtml(1, 1), { onActivate: (e) => seen.push([e.element.id, e.source]) });
    env.bridge.mount();
    env.press('Enter');
    assert.deepEqual(seen, [['c00', 'keyboard']]);
  });
});

describe('Back', () => {
  test('onBack receives context and handling it prevents the key default', () => {
    const calls = [];
    const env = make(gridHtml(1, 1), {
      onBack: (ctx) => {
        calls.push({ focused: ctx.focused.id, modal: ctx.modal, source: ctx.source });
        return true;
      },
    });
    env.bridge.mount();
    const ev = env.press('Escape');
    assert.deepEqual(calls, [{ focused: 'c00', modal: null, source: 'keyboard' }]);
    assert.equal(ev.defaultPrevented, true);
  });

  test('unhandled Back is NOT prevented so the platform can still exit/go back', () => {
    const env = make(gridHtml(1, 1));
    env.bridge.mount();
    assert.equal(env.press('Escape').defaultPrevented, false);
    assert.equal(env.press('Backspace').defaultPrevented, false);
  });

  test('webOS (461) and Tizen (10009) back codes reach onBack', () => {
    let count = 0;
    const env = make(gridHtml(1, 1), { onBack: () => ((count += 1), true) });
    env.bridge.mount();
    env.press('Unidentified', { keyCode: 461 });
    env.press('Unidentified', { keyCode: 10009 });
    assert.equal(count, 2);
  });
});

describe('modal containment and focus restoration', () => {
  const html = `
    ${gridHtml(3, 1)}
    <div id="modal" role="dialog" aria-modal="true" hidden>
      <button id="m1" data-rect="300,300,100,40">Play</button>
      <button id="m2" data-rect="420,300,100,40">More</button>
      <button id="mClose" data-dpad-close data-rect="540,300,100,40">Close</button>
    </div>`;

  function withModal(options) {
    const env = make(html, options);
    env.$('#c01').addEventListener('click', () => (env.$('#modal').hidden = false));
    env.$('#mClose').addEventListener('click', () => (env.$('#modal').hidden = true));
    return env;
  }

  test('opening a modal moves focus inside; arrows cannot leave it', () => {
    const opened = [];
    const env = withModal({ onModalOpen: (e) => opened.push(e.returnFocus.id) });
    env.bridge.mount();
    env.press('ArrowRight');
    env.press('Enter'); // opens modal
    assert.equal(focusedId(env), 'm1');
    assert.deepEqual(opened, ['c01']);
    env.press('ArrowUp');
    env.press('ArrowLeft');
    assert.equal(focusedId(env), 'm1', 'contained');
    env.press('ArrowRight');
    env.press('ArrowRight');
    env.press('ArrowRight');
    assert.equal(focusedId(env), 'mClose');
  });

  test('Back closes the modal and restores focus to the opener', () => {
    const closed = [];
    const env = withModal({ onModalClose: (e) => closed.push(e.restoredTo.id) });
    env.bridge.mount();
    env.press('ArrowRight');
    env.press('Enter');
    env.press('ArrowRight');
    const ev = env.press('Escape');
    assert.equal(ev.defaultPrevented, true);
    assert.equal(env.$('#modal').hidden, true, 'closed through its [data-dpad-close] button');
    assert.equal(focusedId(env), 'c01');
    assert.equal(env.document.activeElement.id, 'c01');
    assert.deepEqual(closed, ['c01']);
  });

  test('focus escaping the modal (e.g. Tab) is pulled back inside', () => {
    const env = withModal();
    env.bridge.mount();
    env.bridge.focus('#c01');
    env.press('Enter');
    env.$('#c02').focus();
    assert.equal(env.bridge.getModal().id, 'modal');
    assert.ok(env.$('#modal').contains(env.document.activeElement));
  });

  test('app-closed modal (mouse click) also restores focus on the next key', () => {
    const env = withModal();
    env.bridge.mount();
    env.press('ArrowRight');
    env.press('Enter');
    env.$('#modal').hidden = true; // app closed it without telling the SDK
    env.press('ArrowRight');
    assert.equal(focusedId(env), 'c02', 'restored to c01 then moved right');
  });

  test('<dialog open> is detected and data-dpad-restore overrides the return target', () => {
    const env = make(`
      ${gridHtml(3, 1)}
      <dialog id="dlg" data-dpad-restore="#c02">
        <button id="d1" data-rect="300,300,100,40">x</button>
      </dialog>`);
    env.bridge.mount();
    env.$('#dlg').setAttribute('open', '');
    env.press('ArrowRight');
    assert.equal(focusedId(env), 'd1');
    // jsdom has no HTMLDialogElement.close(); the app listens for dpad:close.
    env.$('#dlg').addEventListener('dpad:close', () => env.$('#dlg').removeAttribute('open'));
    env.press('Escape');
    assert.equal(focusedId(env), 'c02');
  });

  test('onBack can take over while a modal is open', () => {
    const env = withModal({ onBack: (ctx) => (ctx.modal ? (ctx.closeModal(), true) : false) });
    env.bridge.mount();
    env.press('ArrowRight');
    env.press('Enter');
    env.press('Escape');
    assert.equal(env.$('#modal').hidden, true);
    assert.equal(focusedId(env), 'c01');
  });
});

describe('scroll reveal', () => {
  test('moving to an item below the fold scrolls its container, and back up again', () => {
    let items = '';
    for (let i = 0; i < 20; i += 1) items += `<button id="i${i}" data-rect="0,${i * 50},200,40">Item ${i}</button>`;
    const env = make(`<div id="list" data-rect="0,0,200,200" data-scroll="1000">${items}</div>`, { scrollMargin: 10 });
    const list = env.$('#list');
    env.bridge.mount();
    assert.equal(list.scrollTop, 0);
    for (let i = 0; i < 6; i += 1) env.press('ArrowDown');
    assert.equal(focusedId(env), 'i6');
    // i6 spans 300..340; visible bottom 200 - margin 10 => scrollTop 150.
    assert.equal(list.scrollTop, 150);
    const r = env.$('#i6').getBoundingClientRect();
    assert.ok(r.top >= 0 && r.bottom <= 200, 'focused item fully visible');
    for (let i = 0; i < 6; i += 1) env.press('ArrowUp');
    assert.equal(focusedId(env), 'i0');
    assert.equal(list.scrollTop, 0);
  });

  test('center mode keeps the focused row centred', () => {
    let items = '';
    for (let i = 0; i < 20; i += 1) items += `<button id="i${i}" data-rect="0,${i * 50},200,40">Item ${i}</button>`;
    const env = make(`<div id="list" data-rect="0,0,200,200" data-scroll="1000">${items}</div>`, { scrollMode: 'center' });
    env.bridge.mount();
    env.bridge.focus('#i10');
    // centre of i10 = 520; view centre = 100 => scrollTop 420
    assert.equal(env.$('#list').scrollTop, 420);
  });
});

describe('text inputs are never hijacked', () => {
  const html = `
    <input id="search" value="pasta" data-rect="0,0,300,40">
    <button id="go" data-rect="320,0,100,40">Go</button>
    <button id="below" data-rect="0,60,100,40">Below</button>`;

  test('typing letters, Space and Backspace inside an input are left alone', () => {
    const env = make(html, { onBack: () => assert.fail('Backspace in a field is not Back') });
    env.bridge.mount();
    assert.equal(focusedId(env), 'search');
    for (const key of ['a', ' ', 'Backspace', 'Enter']) {
      assert.equal(env.press(key).defaultPrevented, false, `${key} reaches the input`);
    }
    assert.equal(focusedId(env), 'search');
  });

  test('Left/Right move the caret mid-text and only leave at the edge', () => {
    const env = make(html);
    env.bridge.mount();
    const input = env.$('#search');
    input.setSelectionRange(2, 2);
    assert.equal(env.press('ArrowRight').defaultPrevented, false);
    assert.equal(focusedId(env), 'search');
    input.setSelectionRange(5, 5);
    env.press('ArrowRight');
    assert.equal(focusedId(env), 'go');
  });

  test('Down leaves a single-line input', () => {
    const env = make(html);
    env.bridge.mount();
    env.press('ArrowDown');
    assert.equal(focusedId(env), 'below');
  });

  test('modifier shortcuts are never intercepted', () => {
    const env = make(gridHtml(2, 1));
    env.bridge.mount();
    assert.equal(env.press('ArrowRight', { altKey: true }).defaultPrevented, false);
    assert.equal(env.press('ArrowRight', { ctrlKey: true }).defaultPrevented, false);
    assert.equal(focusedId(env), 'c00');
  });

  test('keys the app already handled (defaultPrevented) are ignored', () => {
    const env = make(gridHtml(2, 1));
    env.$('#c00').addEventListener('keydown', (e) => e.preventDefault());
    env.bridge.mount();
    env.press('ArrowRight');
    assert.equal(focusedId(env), 'c00');
  });
});

describe('gamepad integration (mock Gamepad API)', () => {
  test('D-pad and A drive navigation and activation through the bridge', () => {
    let pads = [];
    let t = 0;
    let frameCb = null;
    const env = make(gridHtml(2, 1), {
      gamepad: {
        getGamepads: () => pads,
        now: () => t,
        requestFrame: (cb) => ((frameCb = cb), 1),
        cancelFrame: () => {},
      },
    });
    const btn = (i) => {
      const b = [];
      for (let k = 0; k < 17; k += 1) b.push({ pressed: k === i, value: k === i ? 1 : 0 });
      return [{ connected: true, buttons: b, axes: [0, 0] }];
    };
    let clicks = 0;
    env.$('#c01').addEventListener('click', () => (clicks += 1));
    env.bridge.mount();
    pads = btn(-1);
    env.window.dispatchEvent(new env.window.Event('gamepadconnected'));
    const step = (p) => {
      pads = p;
      t += 16;
      const cb = frameCb;
      frameCb = null;
      cb();
    };
    step(btn(15)); // right
    assert.equal(focusedId(env), 'c01');
    step(btn(-1));
    step(btn(0)); // A
    step(btn(0));
    step(btn(-1));
    assert.equal(clicks, 1, 'held A fires once');
    env.bridge.destroy();
    frameCb = null;
    env.window.dispatchEvent(new env.window.Event('gamepadconnected'));
    assert.equal(frameCb, null, 'no polling after destroy');
  });
});

describe('destroy', () => {
  function spyListeners(target) {
    const live = new Set();
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    target.addEventListener = (type, fn, opt) => {
      live.add(`${type}|${!!(opt && (opt === true || opt.capture))}|${fnId(fn)}`);
      return add(type, fn, opt);
    };
    target.removeEventListener = (type, fn, opt) => {
      live.delete(`${type}|${!!(opt && (opt === true || opt.capture))}|${fnId(fn)}`);
      return remove(type, fn, opt);
    };
    return live;
  }
  const ids = new WeakMap();
  let next = 0;
  const fnId = (fn) => {
    if (!ids.has(fn)) ids.set(fn, ++next);
    return ids.get(fn);
  };

  test('removes every listener it added, its class, style, attributes and gamepad hooks', () => {
    const env = setup(gridHtml(3, 1));
    const winLive = spyListeners(env.window);
    const docLive = spyListeners(env.document);
    env.window.navigator.getGamepads = () => [];
    const bridge = createDPadBridge({ root: env.document.body, observe: true, gamepad: true });
    bridge.mount();
    assert.ok(winLive.size >= 3, 'keydown + gamepad listeners on window');
    assert.ok(docLive.size >= 2, 'focusin + close listeners on document');
    bridge.destroy();
    assert.equal(winLive.size, 0, `window listeners left: ${[...winLive]}`);
    assert.equal(docLive.size, 0, `document listeners left: ${[...docLive]}`);
    assert.equal(env.document.querySelectorAll('.dpad-focus').length, 0);
    assert.equal(env.document.querySelector('style[data-dpad-bridge-style]'), null);
    assert.equal(env.document.body.hasAttribute('data-dpad-bridge'), false);
    assert.equal(bridge.isMounted, false);
  });

  test('keys after destroy do nothing and are not prevented', () => {
    const env = make(gridHtml(3, 1));
    let clicks = 0;
    env.$('#c00').addEventListener('click', () => (clicks += 1));
    env.bridge.mount();
    env.bridge.destroy();
    env.$('#c00').focus();
    assert.equal(env.press('ArrowRight').defaultPrevented, false);
    assert.equal(env.press('Enter').defaultPrevented, false);
    assert.equal(env.document.activeElement.id, 'c00');
    assert.equal(clicks, 0);
    assert.equal(env.bridge.move('right'), false);
  });

  test('destroy is idempotent and the bridge can be mounted again', () => {
    const env = make(gridHtml(2, 1));
    env.bridge.mount().destroy().destroy();
    env.bridge.mount();
    env.press('ArrowRight');
    assert.equal(focusedId(env), 'c01');
    env.bridge.destroy();
  });

  test('two bridges share one stylesheet; it is removed only after both are destroyed', () => {
    const env = setup(`<section id="a">${gridHtml(1, 1)}</section><section id="b"><button id="x" data-rect="0,100,10,10">x</button></section>`);
    const one = createDPadBridge({ root: env.$('#a'), gamepad: false, keyboard: false }).mount();
    const two = createDPadBridge({ root: env.$('#b'), gamepad: false, keyboard: false, autoFocus: false }).mount();
    assert.equal(env.$$('style[data-dpad-bridge-style]').length, 1);
    one.destroy();
    assert.equal(env.$$('style[data-dpad-bridge-style]').length, 1);
    two.destroy();
    assert.equal(env.$$('style[data-dpad-bridge-style]').length, 0);
  });

  test('on() returns an unsubscribe function', () => {
    const env = make(gridHtml(3, 1));
    const moves = [];
    const off = env.bridge.on('move', (e) => moves.push(e.to.id));
    env.bridge.mount();
    env.press('ArrowRight');
    off();
    env.press('ArrowRight');
    assert.deepEqual(moves, ['c01']);
  });
});
