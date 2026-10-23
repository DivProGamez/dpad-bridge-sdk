import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeKey,
  resolveKeymap,
  normalizeGamepad,
  combineGamepads,
  createGamepadPoller,
  DEFAULT_KEYMAP,
} from '../src/input.js';

describe('normalizeKey', () => {
  test('maps arrows, Enter and Back keys by KeyboardEvent.key', () => {
    assert.equal(normalizeKey({ key: 'ArrowUp' }), 'up');
    assert.equal(normalizeKey({ key: 'ArrowDown' }), 'down');
    assert.equal(normalizeKey({ key: 'ArrowLeft' }), 'left');
    assert.equal(normalizeKey({ key: 'ArrowRight' }), 'right');
    assert.equal(normalizeKey({ key: 'Enter' }), 'ok');
    assert.equal(normalizeKey({ key: 'Escape' }), 'back');
    assert.equal(normalizeKey({ key: 'GoBack' }), 'back');
    assert.equal(normalizeKey({ key: 'BrowserBack' }), 'back');
  });

  test('maps legacy keyCodes used by TV browsers (webOS 461, Tizen 10009)', () => {
    assert.equal(normalizeKey({ key: 'Unidentified', keyCode: 461 }), 'back');
    assert.equal(normalizeKey({ key: 'Unidentified', keyCode: 10009 }), 'back');
    assert.equal(normalizeKey({ keyCode: 38 }), 'up');
    assert.equal(normalizeKey({ which: 13 }), 'ok');
  });

  test('ignores keys it does not own (letters, media, voice)', () => {
    assert.equal(normalizeKey({ key: 'a', keyCode: 65 }), null);
    assert.equal(normalizeKey({ key: 'MediaPlayPause', keyCode: 179 }), null);
    assert.equal(normalizeKey({ key: 'MicrophoneToggle' }), null);
    assert.equal(normalizeKey({ key: 'Tab', keyCode: 9 }), null);
    assert.equal(normalizeKey(null), null);
  });

  test('keymap overrides replace one action and keep the rest', () => {
    const map = resolveKeymap({ back: ['Escape'] });
    assert.equal(normalizeKey({ key: 'Backspace', keyCode: 8 }, map), null);
    assert.equal(normalizeKey({ key: 'Escape' }, map), 'back');
    assert.equal(normalizeKey({ key: 'ArrowUp' }, map), 'up');
    assert.deepEqual(DEFAULT_KEYMAP.up, ['ArrowUp', 'Up', 38]);
  });
});

const pad = ({ buttons = {}, axes = [0, 0], connected = true } = {}) => {
  const list = [];
  for (let i = 0; i < 17; i += 1) list.push({ pressed: !!buttons[i], value: buttons[i] ? 1 : 0 });
  return { connected, mapping: 'standard', buttons: list, axes };
};

describe('normalizeGamepad (mocked Gamepad objects; no real hardware)', () => {
  test('standard-mapping D-pad, A and B', () => {
    assert.deepEqual(normalizeGamepad(pad({ buttons: { 12: 1 } })), {
      up: true, down: false, left: false, right: false, ok: false, back: false,
    });
    assert.equal(normalizeGamepad(pad({ buttons: { 13: 1 } })).down, true);
    assert.equal(normalizeGamepad(pad({ buttons: { 14: 1 } })).left, true);
    assert.equal(normalizeGamepad(pad({ buttons: { 15: 1 } })).right, true);
    assert.equal(normalizeGamepad(pad({ buttons: { 0: 1 } })).ok, true);
    assert.equal(normalizeGamepad(pad({ buttons: { 1: 1 } })).back, true);
  });

  test('left stick respects the dead zone', () => {
    assert.equal(normalizeGamepad(pad({ axes: [0.3, 0] })).right, false);
    assert.equal(normalizeGamepad(pad({ axes: [0.9, 0] })).right, true);
    assert.equal(normalizeGamepad(pad({ axes: [0, -0.8] })).up, true);
    assert.equal(normalizeGamepad(pad({ axes: [0, 0.8] }), { deadzone: 0.9 }).down, false);
  });

  test('analog trigger-style values and numeric buttons are supported', () => {
    const p = { buttons: [0.9, 0.1], axes: [] };
    assert.equal(normalizeGamepad(p).ok, true);
    assert.equal(normalizeGamepad(p).back, false);
  });

  test('disconnected or missing pads report nothing', () => {
    assert.equal(normalizeGamepad(null).up, false);
    assert.equal(normalizeGamepad(pad({ buttons: { 12: 1 }, connected: false })).up, false);
  });

  test('several pads are OR-ed together', () => {
    const s = combineGamepads([null, pad({ buttons: { 12: 1 } }), pad({ buttons: { 0: 1 } })]);
    assert.equal(s.up, true);
    assert.equal(s.ok, true);
    assert.equal(s.down, false);
  });
});

describe('createGamepadPoller', () => {
  function harness(opts = {}) {
    let t = 0;
    let pads = [];
    const actions = [];
    const poller = createGamepadPoller({
      win: undefined,
      getGamepads: () => pads,
      now: () => t,
      requestFrame: () => 1,
      cancelFrame: () => {},
      onAction: (action, info) => actions.push(info.repeat ? `${action}*` : action),
      ...opts,
    });
    return {
      poller,
      actions,
      set: (p) => (pads = p),
      at: (ms) => {
        t = ms;
        poller.poll();
      },
    };
  }

  test('fires once per press (edge detection) for OK and Back', () => {
    const h = harness();
    h.set([pad({ buttons: { 0: 1 } })]);
    h.at(0);
    h.at(16);
    h.at(1000);
    h.set([pad()]);
    h.at(1016);
    h.set([pad({ buttons: { 0: 1 } })]);
    h.at(1032);
    h.set([pad({ buttons: { 1: 1 } })]);
    h.at(1048);
    assert.deepEqual(h.actions, ['ok', 'ok', 'back']);
  });

  test('held directions auto-repeat after the delay at the interval', () => {
    const h = harness({ repeatDelay: 400, repeatInterval: 100 });
    h.set([pad({ buttons: { 13: 1 } })]);
    for (let ms = 0; ms <= 700; ms += 50) h.at(ms);
    // press at 0; repeats at 400, 500, 600, 700
    assert.deepEqual(h.actions, ['down', 'down*', 'down*', 'down*', 'down*']);
  });

  test('releasing stops the repeat', () => {
    const h = harness({ repeatDelay: 100, repeatInterval: 100 });
    h.set([pad({ buttons: { 15: 1 } })]);
    h.at(0);
    h.at(100);
    h.set([pad()]);
    h.at(200);
    h.at(300);
    assert.deepEqual(h.actions, ['right', 'right*']);
  });

  test('degrades gracefully when the Gamepad API is absent', () => {
    const poller = createGamepadPoller({ win: { navigator: {} }, onAction: () => assert.fail('no input expected') });
    assert.equal(poller.supported, false);
    poller.attach();
    poller.poll();
    poller.start();
    assert.equal(poller.running, false);
    poller.destroy();
  });

  test('only starts its frame loop when a pad is connected, and stops on disconnect', () => {
    const handlers = {};
    let pads = [];
    let frames = 0;
    let cancelled = 0;
    const win = {
      navigator: { getGamepads: () => pads },
      addEventListener: (type, fn) => (handlers[type] = fn),
      removeEventListener: (type) => delete handlers[type],
    };
    const poller = createGamepadPoller({
      win,
      onAction: () => {},
      requestFrame: () => ++frames,
      cancelFrame: () => cancelled++,
    });
    poller.attach();
    assert.equal(poller.running, false);
    assert.equal(frames, 0);
    pads = [pad()];
    handlers.gamepadconnected();
    assert.equal(poller.running, true);
    assert.equal(frames, 1);
    pads = [null];
    handlers.gamepaddisconnected();
    assert.equal(poller.running, false);
    assert.equal(cancelled, 1);
    poller.destroy();
    assert.deepEqual(Object.keys(handlers), []);
  });
});
