/**
 * Input adapters: keyboard / TV-remote key normalisation and Gamepad API polling.
 */

/**
 * Logical action → list of `KeyboardEvent.key` strings and legacy `keyCode`
 * numbers. Only keys listed here are ever handled (and preventDefault-ed);
 * everything else, including media, voice and microphone keys, passes through.
 *
 * TV platforms differ: 461 is "Back" on LG webOS, 10009 on Samsung Tizen and
 * 166 is the legacy BrowserBack code. Override with the `keymap` option.
 */
export const DEFAULT_KEYMAP = Object.freeze({
  up: Object.freeze(['ArrowUp', 'Up', 38]),
  down: Object.freeze(['ArrowDown', 'Down', 40]),
  left: Object.freeze(['ArrowLeft', 'Left', 37]),
  right: Object.freeze(['ArrowRight', 'Right', 39]),
  ok: Object.freeze(['Enter', 13]),
  back: Object.freeze(['Escape', 'Esc', 27, 'GoBack', 'BrowserBack', 166, 461, 10009, 'Backspace', 8]),
});

export const ACTIONS = Object.freeze(['up', 'down', 'left', 'right', 'ok', 'back']);

/** Merge user overrides into the default keymap (an override replaces that action's list). */
export function resolveKeymap(overrides) {
  const map = {};
  for (const action of ACTIONS) {
    const list = overrides && Object.prototype.hasOwnProperty.call(overrides, action)
      ? overrides[action]
      : DEFAULT_KEYMAP[action];
    map[action] = Array.isArray(list) ? list.slice() : [];
  }
  return map;
}

/** Map a KeyboardEvent-like object to 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | null. */
export function normalizeKey(event, keymap = DEFAULT_KEYMAP) {
  if (!event) return null;
  const key = event.key;
  const code = typeof event.keyCode === 'number' && event.keyCode !== 0 ? event.keyCode : event.which;
  for (const action of ACTIONS) {
    const list = keymap[action];
    if (!list) continue;
    for (const entry of list) {
      if (typeof entry === 'string' ? entry === key : entry === code) return action;
    }
  }
  return null;
}

export function isBackspace(event) {
  return !!event && (event.key === 'Backspace' || event.keyCode === 8);
}

function pressed(button) {
  if (button == null) return false;
  if (typeof button === 'number') return button > 0.5;
  return !!button.pressed || (typeof button.value === 'number' && button.value > 0.5);
}

/**
 * Read one Gamepad (standard mapping) into logical buttons.
 * D-pad = buttons 12-15, A/Cross = 0 (OK), B/Circle = 1 (Back),
 * left stick = axes 0/1 with a dead zone.
 */
export function normalizeGamepad(pad, { deadzone = 0.5 } = {}) {
  const state = { up: false, down: false, left: false, right: false, ok: false, back: false };
  if (!pad || pad.connected === false) return state;
  const b = pad.buttons || [];
  const a = pad.axes || [];
  const x = typeof a[0] === 'number' ? a[0] : 0;
  const y = typeof a[1] === 'number' ? a[1] : 0;
  state.up = pressed(b[12]) || y < -deadzone;
  state.down = pressed(b[13]) || y > deadzone;
  state.left = pressed(b[14]) || x < -deadzone;
  state.right = pressed(b[15]) || x > deadzone;
  state.ok = pressed(b[0]);
  state.back = pressed(b[1]);
  return state;
}

/** OR together the logical state of every connected pad. */
export function combineGamepads(pads, options) {
  const total = { up: false, down: false, left: false, right: false, ok: false, back: false };
  for (const pad of pads || []) {
    if (!pad) continue;
    const s = normalizeGamepad(pad, options);
    for (const k of ACTIONS) total[k] = total[k] || s[k];
  }
  return total;
}

const REPEATABLE = new Set(['up', 'down', 'left', 'right']);

/**
 * Poll the Gamepad API and emit logical actions with edge detection and
 * held-direction auto-repeat. OK and Back fire once per press, never repeat.
 *
 * The animation-frame loop only runs while at least one pad is connected.
 * All environment hooks are injectable so the poller is testable without
 * a browser or real hardware.
 */
export function createGamepadPoller({
  win = typeof window !== 'undefined' ? window : undefined,
  onAction,
  repeatDelay = 400,
  repeatInterval = 120,
  deadzone = 0.5,
  now,
  getGamepads,
  requestFrame,
  cancelFrame,
} = {}) {
  const nav = win && win.navigator;
  const readPads =
    getGamepads ||
    (nav && typeof nav.getGamepads === 'function' ? () => nav.getGamepads() : null);
  const clock = now || (() => (win && win.performance ? win.performance.now() : Date.now()));
  const raf = requestFrame || (win && win.requestAnimationFrame ? (cb) => win.requestAnimationFrame(cb) : null);
  const caf = cancelFrame || (win && win.cancelAnimationFrame ? (id) => win.cancelAnimationFrame(id) : null);

  const held = {};
  for (const k of ACTIONS) held[k] = { down: false, since: 0, last: 0 };
  let frame = null;
  let running = false;
  let destroyed = false;
  const disposers = [];

  const supported = typeof readPads === 'function';

  function poll() {
    if (!supported || destroyed) return;
    let pads;
    try {
      pads = readPads() || [];
    } catch {
      pads = [];
    }
    const state = combineGamepads(Array.from(pads), { deadzone });
    const t = clock();
    for (const action of ACTIONS) {
      const h = held[action];
      if (state[action] && !h.down) {
        h.down = true;
        h.since = t;
        h.last = t;
        onAction && onAction(action, { source: 'gamepad', repeat: false });
      } else if (state[action] && h.down && REPEATABLE.has(action)) {
        if (t - h.since >= repeatDelay && t - h.last >= repeatInterval) {
          h.last = t;
          onAction && onAction(action, { source: 'gamepad', repeat: true });
        }
      } else if (!state[action] && h.down) {
        h.down = false;
      }
    }
  }

  function loop() {
    frame = null;
    if (!running) return;
    poll();
    if (running && raf) frame = raf(loop);
  }

  function anyConnected() {
    try {
      return Array.from(readPads() || []).some((p) => p && p.connected !== false);
    } catch {
      return false;
    }
  }

  function start() {
    if (!supported || destroyed || running) return;
    running = true;
    if (raf) frame = raf(loop);
  }

  function stop() {
    running = false;
    if (frame != null && caf) caf(frame);
    frame = null;
    for (const k of ACTIONS) held[k].down = false;
  }

  function listen() {
    if (!supported || !win || typeof win.addEventListener !== 'function') return;
    const onConnect = () => start();
    const onDisconnect = () => {
      if (!anyConnected()) stop();
    };
    win.addEventListener('gamepadconnected', onConnect);
    win.addEventListener('gamepaddisconnected', onDisconnect);
    disposers.push(() => win.removeEventListener('gamepadconnected', onConnect));
    disposers.push(() => win.removeEventListener('gamepaddisconnected', onDisconnect));
  }

  return {
    supported,
    /** Begin listening for pads; starts polling immediately if one is already connected. */
    attach() {
      if (!supported || destroyed) return;
      listen();
      if (anyConnected()) start();
    },
    start,
    stop,
    poll,
    get running() {
      return running;
    },
    destroy() {
      stop();
      destroyed = true;
      while (disposers.length) disposers.pop()();
    },
  };
}
