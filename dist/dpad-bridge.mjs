/*! DPadBridge SDK v0.1.0 | MIT License | https://github.com/DivProGamez/dpad-bridge-sdk */

// src/geometry.js
var DIRECTIONS = Object.freeze(["up", "down", "left", "right"]);
var EDGE_TOLERANCE = 1;
var ORTHO_WEIGHT = 4;
var CENTER_WEIGHT = 0.25;
var ALIGN_BONUS = 20;
var TIE_EPSILON = 0.5;
var HORIZONTAL = { left: true, right: true, up: false, down: false };
function toRect(r) {
  var _a, _b, _c, _d;
  const left = num((_a = r.left) != null ? _a : r.x);
  const top = num((_b = r.top) != null ? _b : r.y);
  const width = num((_c = r.width) != null ? _c : num(r.right) - left);
  const height = num((_d = r.height) != null ? _d : num(r.bottom) - top);
  return Object.freeze({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height
  });
}
function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function isDirection(value) {
  return DIRECTIONS.includes(value);
}
function primaryGap(from, to, direction) {
  switch (direction) {
    case "right":
      return to.left - from.right;
    case "left":
      return from.left - to.right;
    case "down":
      return to.top - from.bottom;
    case "up":
      return from.top - to.bottom;
    default:
      throw new TypeError(`Unknown direction: ${direction}`);
  }
}
function perpendicularOverlap(from, to, direction) {
  return HORIZONTAL[direction] ? Math.min(from.bottom, to.bottom) - Math.max(from.top, to.top) : Math.min(from.right, to.right) - Math.max(from.left, to.left);
}
function centerOffset(from, to, direction) {
  return HORIZONTAL[direction] ? Math.abs(from.top + from.height / 2 - (to.top + to.height / 2)) : Math.abs(from.left + from.width / 2 - (to.left + to.width / 2));
}
function isBeyond(from, to, direction, tolerance = EDGE_TOLERANCE) {
  return primaryGap(from, to, direction) >= -tolerance;
}
function isLooselyBeyond(from, to, direction) {
  const fcx = from.left + from.width / 2;
  const fcy = from.top + from.height / 2;
  const tcx = to.left + to.width / 2;
  const tcy = to.top + to.height / 2;
  switch (direction) {
    case "right":
      return tcx > fcx + EDGE_TOLERANCE && to.right > from.right;
    case "left":
      return tcx < fcx - EDGE_TOLERANCE && to.left < from.left;
    case "down":
      return tcy > fcy + EDGE_TOLERANCE && to.bottom > from.bottom;
    case "up":
      return tcy < fcy - EDGE_TOLERANCE && to.top < from.top;
    default:
      throw new TypeError(`Unknown direction: ${direction}`);
  }
}
function scoreCandidate(from, to, direction) {
  const primary = Math.max(0, primaryGap(from, to, direction));
  const overlap = perpendicularOverlap(from, to, direction);
  const orthoGap = Math.max(0, -overlap);
  const smaller = HORIZONTAL[direction] ? Math.min(from.height, to.height) : Math.min(from.width, to.width);
  const overlapRatio = smaller > 0 ? Math.min(1, Math.max(0, overlap) / smaller) : 0;
  const offset = centerOffset(from, to, direction);
  const score = primary + ORTHO_WEIGHT * orthoGap + CENTER_WEIGHT * offset - ALIGN_BONUS * overlapRatio;
  return { score, primary, orthoGap, centerOffset: offset, overlapRatio };
}
function pickNext(from, candidates, direction) {
  if (!isDirection(direction)) throw new TypeError(`Unknown direction: ${direction}`);
  const source = toRect(from);
  const list = candidates.map((c, index) => ({ c, index, rect: toRect(c.rect) }));
  let pool = list.filter((x) => isBeyond(source, x.rect, direction));
  if (pool.length === 0) pool = list.filter((x) => isLooselyBeyond(source, x.rect, direction));
  if (pool.length === 0) return null;
  let best = null;
  for (const entry of pool) {
    entry.s = scoreCandidate(source, entry.rect, direction);
    if (!best || compare(entry, best) < 0) best = entry;
  }
  return best.c;
}
function compare(a, b) {
  const d = a.s.score - b.s.score;
  if (Math.abs(d) > TIE_EPSILON) return d;
  if (a.s.primary !== b.s.primary) return a.s.primary - b.s.primary;
  if (a.s.centerOffset !== b.s.centerOffset) return a.s.centerOffset - b.s.centerOffset;
  return a.index - b.index;
}
function rectDistance(a, b) {
  const dx = Math.max(0, a.left - b.right, b.left - a.right);
  const dy = Math.max(0, a.top - b.bottom, b.top - a.bottom);
  return Math.hypot(dx, dy);
}
function nearestCandidate(rect, candidates) {
  const source = toRect(rect);
  const scx = source.left + source.width / 2;
  const scy = source.top + source.height / 2;
  let best = null;
  let bestKey = null;
  candidates.forEach((c, index) => {
    const r = toRect(c.rect);
    const key = [
      rectDistance(source, r),
      Math.hypot(r.left + r.width / 2 - scx, r.top + r.height / 2 - scy),
      index
    ];
    if (!bestKey || key[0] < bestKey[0] || key[0] === bestKey[0] && key[1] < bestKey[1]) {
      best = c;
      bestKey = key;
    }
  });
  return best;
}

// src/targets.js
var DEFAULT_SELECTORS = Object.freeze([
  "a[href]",
  "button",
  'input:not([type="hidden"])',
  "select",
  "textarea",
  "summary",
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  "[data-dpad-focusable]"
]);
var NATIVELY_FOCUSABLE = 'a[href], button, input, select, textarea, summary, iframe, [contenteditable=""], [contenteditable="true"]';
var TEXT_INPUT_TYPES = /* @__PURE__ */ new Set(["", "text", "search", "email", "url", "tel", "password"]);
var HORIZONTAL_NATIVE_TYPES = /* @__PURE__ */ new Set([
  "range",
  "date",
  "time",
  "datetime-local",
  "month",
  "week"
]);
function selectorString(selectors) {
  return (Array.isArray(selectors) ? selectors : [selectors]).filter(Boolean).join(", ");
}
function collectTargets(root, selectors = DEFAULT_SELECTORS) {
  const selector = selectorString(selectors);
  if (!selector) return [];
  return Array.from(root.querySelectorAll(selector)).filter((el) => isUsableTarget(el));
}
function needsTabindex(el) {
  return !el.hasAttribute("tabindex") && !el.matches(NATIVELY_FOCUSABLE);
}
function isUsableTarget(el) {
  if (!el || !el.isConnected || el.nodeType !== 1) return false;
  if (el.getAttribute("data-dpad-focusable") === "false") return false;
  if (el.closest("[data-dpad-ignore]")) return false;
  if (isDisabled(el)) return false;
  if (el.closest('[inert], [hidden], [aria-hidden="true"]')) return false;
  return isRendered(el);
}
function isDisabled(el) {
  if (el.getAttribute("aria-disabled") === "true") return true;
  try {
    if (el.matches(":disabled")) return true;
  } catch {
  }
  if ("disabled" in el && el.disabled === true) return true;
  const fieldset = el.closest("fieldset[disabled]");
  if (fieldset) {
    const legend = fieldset.querySelector(":scope > legend");
    if (!(legend && legend.contains(el))) return true;
  }
  return false;
}
function isRendered(el) {
  const view = el.ownerDocument && el.ownerDocument.defaultView;
  if (typeof el.checkVisibility === "function") {
    if (!el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true })) return false;
  } else if (view) {
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      if (view.getComputedStyle(node).display === "none") return false;
    }
    if (view.getComputedStyle(el).visibility === "hidden") return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
function editableKind(el) {
  if (!el || el.nodeType !== 1) return null;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return "multiline";
  if (tag === "SELECT") return "select";
  if (tag === "INPUT") {
    const type = (el.getAttribute("type") || "").toLowerCase();
    if (TEXT_INPUT_TYPES.has(type)) return "text";
    if (type === "number") return "number";
    if (HORIZONTAL_NATIVE_TYPES.has(type)) return "horizontal";
    return null;
  }
  if (el.isContentEditable || el.getAttribute("contenteditable") === "true" || el.getAttribute("contenteditable") === "") {
    return "contenteditable";
  }
  return null;
}
function isTextEntry(el) {
  const kind = editableKind(el);
  return kind === "text" || kind === "number" || kind === "multiline" || kind === "contenteditable";
}
function caret(el) {
  try {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (typeof start !== "number" || typeof end !== "number") return null;
    return { start, end, length: (el.value || "").length };
  } catch {
    return null;
  }
}
function arrowOwnership(el, direction) {
  if (!el || el.nodeType !== 1) return "sdk";
  if (el.closest("[data-dpad-passthrough]")) return "native";
  const kind = editableKind(el);
  const horizontal = direction === "left" || direction === "right";
  switch (kind) {
    case "text": {
      if (!horizontal) return "sdk";
      const c = caret(el);
      if (!c) return "native";
      if (c.start !== c.end) return "native";
      if (direction === "left") return c.start === 0 ? "sdk" : "native";
      return c.end >= c.length ? "sdk" : "native";
    }
    case "multiline": {
      const c = caret(el);
      if (!c || c.start !== c.end) return "native";
      if (direction === "up" || direction === "left") return c.start === 0 ? "sdk" : "native";
      return c.end >= c.length ? "sdk" : "native";
    }
    case "number":
      return horizontal ? "sdk" : "native";
    case "horizontal":
    case "contenteditable":
      return horizontal ? "native" : "sdk";
    default:
      return "sdk";
  }
}

// src/input.js
var DEFAULT_KEYMAP = Object.freeze({
  up: Object.freeze(["ArrowUp", "Up", 38]),
  down: Object.freeze(["ArrowDown", "Down", 40]),
  left: Object.freeze(["ArrowLeft", "Left", 37]),
  right: Object.freeze(["ArrowRight", "Right", 39]),
  ok: Object.freeze(["Enter", 13]),
  back: Object.freeze(["Escape", "Esc", 27, "GoBack", "BrowserBack", 166, 461, 10009, "Backspace", 8])
});
var ACTIONS = Object.freeze(["up", "down", "left", "right", "ok", "back"]);
function resolveKeymap(overrides) {
  const map = {};
  for (const action of ACTIONS) {
    const list = overrides && Object.prototype.hasOwnProperty.call(overrides, action) ? overrides[action] : DEFAULT_KEYMAP[action];
    map[action] = Array.isArray(list) ? list.slice() : [];
  }
  return map;
}
function normalizeKey(event, keymap = DEFAULT_KEYMAP) {
  if (!event) return null;
  const key = event.key;
  const code = typeof event.keyCode === "number" && event.keyCode !== 0 ? event.keyCode : event.which;
  for (const action of ACTIONS) {
    const list = keymap[action];
    if (!list) continue;
    for (const entry of list) {
      if (typeof entry === "string" ? entry === key : entry === code) return action;
    }
  }
  return null;
}
function isBackspace(event) {
  return !!event && (event.key === "Backspace" || event.keyCode === 8);
}
function pressed(button) {
  if (button == null) return false;
  if (typeof button === "number") return button > 0.5;
  return !!button.pressed || typeof button.value === "number" && button.value > 0.5;
}
function normalizeGamepad(pad, { deadzone = 0.5 } = {}) {
  const state = { up: false, down: false, left: false, right: false, ok: false, back: false };
  if (!pad || pad.connected === false) return state;
  const b = pad.buttons || [];
  const a = pad.axes || [];
  const x = typeof a[0] === "number" ? a[0] : 0;
  const y = typeof a[1] === "number" ? a[1] : 0;
  state.up = pressed(b[12]) || y < -deadzone;
  state.down = pressed(b[13]) || y > deadzone;
  state.left = pressed(b[14]) || x < -deadzone;
  state.right = pressed(b[15]) || x > deadzone;
  state.ok = pressed(b[0]);
  state.back = pressed(b[1]);
  return state;
}
function combineGamepads(pads, options) {
  const total = { up: false, down: false, left: false, right: false, ok: false, back: false };
  for (const pad of pads || []) {
    if (!pad) continue;
    const s = normalizeGamepad(pad, options);
    for (const k of ACTIONS) total[k] = total[k] || s[k];
  }
  return total;
}
var REPEATABLE = /* @__PURE__ */ new Set(["up", "down", "left", "right"]);
function createGamepadPoller({
  win = typeof window !== "undefined" ? window : void 0,
  onAction,
  repeatDelay = 400,
  repeatInterval = 120,
  deadzone = 0.5,
  now,
  getGamepads,
  requestFrame,
  cancelFrame
} = {}) {
  const nav = win && win.navigator;
  const readPads = getGamepads || (nav && typeof nav.getGamepads === "function" ? () => nav.getGamepads() : null);
  const clock = now || (() => win && win.performance ? win.performance.now() : Date.now());
  const raf = requestFrame || (win && win.requestAnimationFrame ? (cb) => win.requestAnimationFrame(cb) : null);
  const caf = cancelFrame || (win && win.cancelAnimationFrame ? (id) => win.cancelAnimationFrame(id) : null);
  const held = {};
  for (const k of ACTIONS) held[k] = { down: false, since: 0, last: 0 };
  let frame = null;
  let running = false;
  let destroyed = false;
  const disposers = [];
  const supported = typeof readPads === "function";
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
        onAction && onAction(action, { source: "gamepad", repeat: false });
      } else if (state[action] && h.down && REPEATABLE.has(action)) {
        if (t - h.since >= repeatDelay && t - h.last >= repeatInterval) {
          h.last = t;
          onAction && onAction(action, { source: "gamepad", repeat: true });
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
    if (!supported || !win || typeof win.addEventListener !== "function") return;
    const onConnect = () => start();
    const onDisconnect = () => {
      if (!anyConnected()) stop();
    };
    win.addEventListener("gamepadconnected", onConnect);
    win.addEventListener("gamepaddisconnected", onDisconnect);
    disposers.push(() => win.removeEventListener("gamepadconnected", onConnect));
    disposers.push(() => win.removeEventListener("gamepaddisconnected", onDisconnect));
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
    }
  };
}

// src/scroll.js
var SCROLLABLE = /(auto|scroll|overlay)/;
function scrollingElementOf(doc) {
  return doc.scrollingElement || doc.documentElement;
}
function overflowOf(style, longhand) {
  const value = style[longhand];
  return value && value !== "visible" ? value : style.overflow || "";
}
function getScrollParents(el) {
  const doc = el.ownerDocument;
  const view = doc.defaultView;
  const docScroller = scrollingElementOf(doc);
  const parents = [];
  for (let node = el.parentElement; node && node !== docScroller; node = node.parentElement) {
    if (node === doc.body) continue;
    const style = view.getComputedStyle(node);
    const canY = SCROLLABLE.test(overflowOf(style, "overflowY")) && node.scrollHeight > node.clientHeight;
    const canX = SCROLLABLE.test(overflowOf(style, "overflowX")) && node.scrollWidth > node.clientWidth;
    if (canY || canX) parents.push(node);
  }
  parents.push(docScroller);
  return parents;
}
function visibleArea(container, doc) {
  const view = doc.defaultView;
  if (container === scrollingElementOf(doc)) {
    const height = doc.documentElement.clientHeight || view.innerHeight || 0;
    const width = doc.documentElement.clientWidth || view.innerWidth || 0;
    return { top: 0, left: 0, bottom: height, right: width };
  }
  const r = container.getBoundingClientRect();
  const top = r.top + (container.clientTop || 0);
  const left = r.left + (container.clientLeft || 0);
  return {
    top,
    left,
    bottom: top + (container.clientHeight || r.height),
    right: left + (container.clientWidth || r.width)
  };
}
function axisDelta(start, end, viewStart, viewEnd, margin, mode) {
  const size = viewEnd - viewStart;
  const m = Math.max(0, Math.min(margin, (size - (end - start)) / 2));
  if (mode === "center") {
    return start + (end - start) / 2 - (viewStart + size / 2);
  }
  if (start < viewStart + m) return start - (viewStart + m);
  if (end > viewEnd - m) {
    if (end - start > size - 2 * m) return start - (viewStart + m);
    return end - (viewEnd - m);
  }
  return 0;
}
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
function revealElement(el, { margin = 24, mode = "nearest", behavior = "auto" } = {}) {
  const doc = el.ownerDocument;
  const applied = [];
  const rect = el.getBoundingClientRect();
  let top = rect.top;
  let left = rect.left;
  const height = rect.height;
  const width = rect.width;
  for (const container of getScrollParents(el)) {
    const view = visibleArea(container, doc);
    let dy = axisDelta(top, top + height, view.top, view.bottom, margin, mode);
    let dx = axisDelta(left, left + width, view.left, view.right, margin, mode);
    const maxY = (container.scrollHeight || 0) - (container.clientHeight || 0);
    const maxX = (container.scrollWidth || 0) - (container.clientWidth || 0);
    const fromY = container.scrollTop || 0;
    const fromX = container.scrollLeft || 0;
    const toY = clamp(fromY + dy, 0, maxY);
    const toX = clamp(fromX + dx, 0, maxX);
    dy = toY - fromY;
    dx = toX - fromX;
    if (Math.abs(dy) < 0.5 && Math.abs(dx) < 0.5) continue;
    if (behavior === "smooth" && typeof container.scrollTo === "function") {
      container.scrollTo({ top: toY, left: toX, behavior: "smooth" });
    } else {
      container.scrollTop = toY;
      container.scrollLeft = toX;
    }
    top -= dy;
    left -= dx;
    applied.push({ container, dx, dy });
  }
  return applied;
}

// src/bridge.js
var MODAL_SELECTOR = 'dialog[open], [aria-modal="true"], [data-dpad-modal]';
var GROUP_ATTR = "data-dpad-group";
var DEFAULTS = Object.freeze({
  selectors: DEFAULT_SELECTORS,
  extraSelectors: [],
  focusClass: "dpad-focus",
  initialFocus: null,
  autoFocus: true,
  observe: false,
  gamepad: true,
  keyboard: true,
  scrollMode: "nearest",
  scrollMargin: 24,
  scrollBehavior: null,
  // null = 'smooth', or 'auto' when the user prefers reduced motion
  repeatDelay: 400,
  repeatInterval: 120,
  activationGuard: 150,
  keymap: null,
  rememberGroupFocus: true,
  closeModalOnBack: true,
  modalSelector: MODAL_SELECTOR,
  injectStyles: true,
  now: null
});
var EVENT_OPTIONS = {
  focus: "onFocus",
  move: "onMove",
  activate: "onActivate",
  back: "onBack",
  boundary: "onBoundary",
  modalopen: "onModalOpen",
  modalclose: "onModalClose"
};
var OBSERVED_ATTRIBUTES = [
  "class",
  "style",
  "hidden",
  "disabled",
  "inert",
  "open",
  "href",
  "tabindex",
  "contenteditable",
  "aria-hidden",
  "aria-disabled",
  "aria-modal",
  "data-dpad-focusable",
  "data-dpad-ignore",
  "data-dpad-modal"
];
var styleRegistry = /* @__PURE__ */ new WeakMap();
function focusCss(cls) {
  const c = `.${cssEscape(cls)}`;
  return `${c}{outline:var(--dpad-focus-width,4px) solid var(--dpad-focus-color,#ffd60a)!important;outline-offset:var(--dpad-focus-offset,3px)!important;box-shadow:0 0 0 calc(var(--dpad-focus-offset,3px) + var(--dpad-focus-width,4px) + 3px) var(--dpad-focus-halo,rgba(0,0,0,.85))}@media (prefers-reduced-motion:no-preference){${c}{transition:outline-offset .12s ease-out,box-shadow .12s ease-out}}@media (forced-colors:active){${c}{outline-color:Highlight!important;box-shadow:none}}`;
}
function cssEscape(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}
function acquireStyle(doc, cls) {
  let byClass = styleRegistry.get(doc);
  if (!byClass) styleRegistry.set(doc, byClass = /* @__PURE__ */ new Map());
  let entry = byClass.get(cls);
  if (!entry) {
    const el = doc.createElement("style");
    el.setAttribute("data-dpad-bridge-style", cls);
    el.textContent = focusCss(cls);
    (doc.head || doc.documentElement).appendChild(el);
    entry = { el, count: 0 };
    byClass.set(cls, entry);
  }
  entry.count += 1;
  return () => {
    entry.count -= 1;
    if (entry.count <= 0) {
      entry.el.remove();
      byClass.delete(cls);
    }
  };
}
function resolveRoot(root) {
  if (typeof root === "string") {
    if (typeof document === "undefined") throw new TypeError("DPadBridge: a string root needs a global document");
    const el = document.querySelector(root);
    if (!el) throw new TypeError(`DPadBridge: root "${root}" not found`);
    return el;
  }
  if (root) return root;
  if (typeof document !== "undefined" && document.body) return document.body;
  throw new TypeError("DPadBridge: no root element given");
}
function createDPadBridge(options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const root = resolveRoot(opts.root);
  const doc = root.nodeType === 9 ? root : root.ownerDocument;
  const win = doc.defaultView;
  const scopeRoot = root.nodeType === 9 ? doc.documentElement : root;
  const selectors = [].concat(opts.selectors || [], opts.extraSelectors || []);
  const selector = selectorString(selectors);
  const keymap = resolveKeymap(opts.keymap);
  const now = typeof opts.now === "function" ? opts.now : () => win.performance ? win.performance.now() : Date.now();
  const listeners = /* @__PURE__ */ new Map();
  for (const [event, key] of Object.entries(EVENT_OPTIONS)) {
    if (typeof opts[key] === "function") on(event, opts[key]);
  }
  let mounted = false;
  let targets = [];
  let current = null;
  let lastRect = null;
  let disposers = [];
  let modalStack = [];
  let focusHistory = [];
  let groupMemory = /* @__PURE__ */ new WeakMap();
  let addedTabindex = /* @__PURE__ */ new Set();
  let lastActivation = { el: null, time: -Infinity };
  let lastRepeatMove = -Infinity;
  let observer = null;
  let poller = null;
  let frames = /* @__PURE__ */ new Set();
  let refreshQueued = false;
  let internalFocus = false;
  let syncing = false;
  function on(event, fn) {
    if (typeof fn !== "function") throw new TypeError("DPadBridge.on: handler must be a function");
    if (!listeners.has(event)) listeners.set(event, /* @__PURE__ */ new Set());
    listeners.get(event).add(fn);
    return () => {
      const set = listeners.get(event);
      if (set) set.delete(fn);
    };
  }
  function emit(event, detail) {
    const set = listeners.get(event);
    if (!set) return false;
    let handled = false;
    for (const fn of Array.from(set)) {
      try {
        if (fn(detail) === true) handled = true;
      } catch (err) {
        if (win.console) win.console.error("DPadBridge listener error", err);
      }
    }
    return handled;
  }
  function listen(target, type, fn, capture = false) {
    target.addEventListener(type, fn, capture);
    disposers.push(() => target.removeEventListener(type, fn, capture));
  }
  function frame(fn) {
    if (typeof win.requestAnimationFrame !== "function") return;
    const id = win.requestAnimationFrame(() => {
      frames.delete(id);
      if (mounted) fn();
    });
    frames.add(id);
  }
  function matchesSelector(el) {
    try {
      return !!selector && el.matches(selector);
    } catch {
      return false;
    }
  }
  function isTarget(el) {
    return !!el && el.nodeType === 1 && scopeRoot.contains(el) && matchesSelector(el) && isUsableTarget(el);
  }
  function topModal() {
    return modalStack.length ? modalStack[modalStack.length - 1].modal : null;
  }
  function scope() {
    return topModal() || scopeRoot;
  }
  function candidatesIn(container, exclude) {
    const out = [];
    for (const el of targets) {
      if (el === exclude || !container.contains(el) || !isUsableTarget(el)) continue;
      out.push({ element: el, rect: toRect(el.getBoundingClientRect()), group: groupOf(el) });
    }
    return out;
  }
  function firstTargetIn(container) {
    const preferred = container.querySelector("[data-dpad-autofocus], [data-dpad-initial], [autofocus]");
    if (preferred && isTarget(preferred)) return preferred;
    return targets.find((el) => container.contains(el) && isUsableTarget(el)) || null;
  }
  function collect() {
    targets = selector ? collectTargets(scopeRoot, selectors) : [];
    for (const el of targets) {
      if (needsTabindex(el)) {
        el.setAttribute("tabindex", "0");
        addedTabindex.add(el);
      }
    }
  }
  function groupOf(el) {
    const g = el.parentElement ? el.parentElement.closest(`[${GROUP_ATTR}]`) : null;
    return g && scopeRoot.contains(g) ? g : null;
  }
  function panelAhead(from, panel, direction) {
    const r = toRect(panel.getBoundingClientRect());
    return isBeyond(from, r, direction) && perpendicularOverlap(from, r, direction) > 0;
  }
  function resolveElement(ref) {
    if (!ref) return null;
    if (typeof ref === "string") {
      try {
        return doc.querySelector(ref);
      } catch {
        return null;
      }
    }
    return ref.nodeType === 1 ? ref : null;
  }
  function setClass(el, add) {
    if (!el || !el.classList) return;
    if (add) el.classList.add(opts.focusClass);
    else el.classList.remove(opts.focusClass);
  }
  function scrollBehavior() {
    if (opts.scrollBehavior) return opts.scrollBehavior;
    const reduce = typeof win.matchMedia === "function" && win.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return reduce ? "auto" : "smooth";
  }
  function focusElement(el, { direction = null, source = "api", scroll = true } = {}) {
    const previous = current;
    if (previous && previous !== el) setClass(previous, false);
    current = el;
    setClass(el, true);
    if (doc.activeElement !== el && typeof el.focus === "function") {
      internalFocus = true;
      try {
        el.focus({ preventScroll: true });
      } finally {
        internalFocus = false;
      }
    }
    if (scroll && opts.scrollMode !== false) {
      revealElement(el, { margin: opts.scrollMargin, mode: opts.scrollMode, behavior: scrollBehavior() });
    }
    lastRect = toRect(el.getBoundingClientRect());
    focusHistory = focusHistory.filter((x) => x !== el);
    focusHistory.push(el);
    if (focusHistory.length > 20) focusHistory.shift();
    const group = groupOf(el);
    if (group) groupMemory.set(group, el);
    emit("focus", { element: el, previous, direction, source });
    if (direction) emit("move", { from: previous, to: el, direction, source });
  }
  function clearFocus() {
    if (current) setClass(current, false);
    current = null;
  }
  function focusInitial() {
    const container = scope();
    let el = null;
    if (container === scopeRoot) {
      const requested = resolveElement(opts.initialFocus);
      if (requested && isTarget(requested)) el = requested;
      if (!el && isTarget(doc.activeElement) && targets.includes(doc.activeElement)) el = doc.activeElement;
    }
    if (!el) el = firstTargetIn(container);
    if (el) focusElement(el, { source: "initial" });
    return el;
  }
  function relocate() {
    const container = scope();
    const cands = candidatesIn(container, null);
    const near = lastRect ? nearestCandidate(lastRect, cands) : null;
    if (near) focusElement(near.element, { source: "relocate" });
    else if (cands.length) focusElement(cands[0].element, { source: "relocate" });
    else clearFocus();
  }
  function currentIsValid() {
    return !!current && current.isConnected && isUsableTarget(current) && scope().contains(current);
  }
  function openModals() {
    let found;
    try {
      found = Array.from(scopeRoot.querySelectorAll(opts.modalSelector));
    } catch {
      found = [];
    }
    return found.filter((m) => m.isConnected && isModalVisible(m));
  }
  function isModalVisible(m) {
    if (m.closest("[hidden], [inert]")) return false;
    if (m.tagName === "DIALOG" && !m.open && !m.hasAttribute("open")) return false;
    const view = win;
    for (let node = m; node && node.nodeType === 1; node = node.parentElement) {
      const style = view.getComputedStyle(node);
      if (style.display === "none") return false;
    }
    return view.getComputedStyle(m).visibility !== "hidden";
  }
  function syncModals() {
    if (!mounted || syncing) return;
    syncing = true;
    try {
      const open = openModals();
      const changed = open.length !== modalStack.length || open.some((m) => !modalStack.some((e) => e.modal === m));
      if (changed) collect();
      for (let i = modalStack.length - 1; i >= 0; i -= 1) {
        const entry = modalStack[i];
        if (open.includes(entry.modal)) continue;
        modalStack.splice(i, 1);
        restoreAfterModal(entry);
      }
      for (const modal of open) {
        if (modalStack.some((e) => e.modal === modal)) continue;
        const returnFocus = [...focusHistory].reverse().find((el) => el.isConnected && !modal.contains(el)) || null;
        const entry = {
          modal,
          returnFocus,
          returnRect: returnFocus ? toRect(returnFocus.getBoundingClientRect()) : lastRect
        };
        modalStack.push(entry);
        if (!(current && modal.contains(current) && isUsableTarget(current))) {
          const inside = firstTargetIn(modal);
          if (inside) focusElement(inside, { source: "modal" });
        }
        emit("modalopen", { modal, returnFocus });
      }
    } finally {
      syncing = false;
    }
  }
  function restoreAfterModal(entry) {
    const { modal } = entry;
    const needsRestore = !current || modal.contains(current) || !currentIsValid();
    let restoredTo = null;
    if (needsRestore) {
      const container = scope();
      const declared = resolveElement(modal.getAttribute("data-dpad-restore"));
      const candidates = [declared, entry.returnFocus];
      for (const el of candidates) {
        if (el && isTarget(el) && container.contains(el)) {
          restoredTo = el;
          break;
        }
      }
      if (!restoredTo && entry.returnRect) {
        const near = nearestCandidate(entry.returnRect, candidatesIn(container, null));
        if (near) restoredTo = near.element;
      }
      if (!restoredTo) restoredTo = firstTargetIn(container);
      if (restoredTo) focusElement(restoredTo, { source: "restore" });
      else clearFocus();
    } else {
      restoredTo = current;
    }
    emit("modalclose", { modal, restoredTo });
  }
  function requestModalClose(modal) {
    const closer = modal.querySelector("[data-dpad-close]");
    if (closer && isUsableTarget(closer)) {
      closer.click();
    } else if (typeof modal.close === "function") {
      modal.close();
    } else {
      modal.dispatchEvent(new win.CustomEvent("dpad:close", { bubbles: true }));
    }
    syncModals();
  }
  function move(direction) {
    if (!mounted) return false;
    if (!isDirection(direction)) throw new TypeError(`DPadBridge.move: unknown direction "${direction}"`);
    syncModals();
    if (!currentIsValid()) {
      if (current) relocate();
      else focusInitial();
      return !!current;
    }
    const container = scope();
    const explicit = current.getAttribute(`data-dpad-${direction}`);
    if (explicit === "none") {
      emit("boundary", { element: current, direction });
      return false;
    }
    if (explicit) {
      const target = resolveElement(explicit);
      if (target && isTarget(target) && container.contains(target)) {
        focusElement(target, { direction, source: "explicit" });
        return true;
      }
    }
    const from = toRect(current.getBoundingClientRect());
    const cands = candidatesIn(container, current);
    const group = groupOf(current);
    let next = null;
    if (group) next = pickNext(from, cands.filter((c) => c.group === group), direction);
    if (!next) {
      const pool = group ? cands.filter((c) => c.group !== group && perpendicularOverlap(from, c.rect, direction) > 0) : cands;
      next = pickNext(from, pool, direction);
      if (!next && group) {
        next = pickNext(from, cands.filter((c) => c.group && c.group !== group && panelAhead(from, c.group, direction)), direction);
      }
      if (next && opts.rememberGroupFocus && next.group && next.group !== group) {
        const remembered = groupMemory.get(next.group);
        if (remembered && remembered !== current && isTarget(remembered) && container.contains(remembered)) {
          next = { element: remembered };
        }
      }
    }
    if (!next) {
      emit("boundary", { element: current, direction });
      return false;
    }
    focusElement(next.element, { direction, source: "navigation" });
    return true;
  }
  function activate({ source = "api" } = {}) {
    if (!mounted) return false;
    syncModals();
    if (!currentIsValid()) return false;
    const el = current;
    const t = now();
    if (lastActivation.el === el && t - lastActivation.time < opts.activationGuard) return false;
    lastActivation = { el, time: t };
    const kind = editableKind(el);
    if (kind === "select") {
      let opened = false;
      if (typeof el.showPicker === "function") {
        try {
          el.showPicker();
          opened = true;
        } catch {
          opened = false;
        }
      }
      if (!opened && doc.activeElement !== el) el.focus();
    } else if (isTextEntry(el)) {
      if (doc.activeElement !== el) el.focus();
    } else {
      el.click();
    }
    emit("activate", { element: el, source });
    syncModals();
    frame(syncModals);
    return true;
  }
  function back({ event = null, source = "api" } = {}) {
    if (!mounted) return false;
    syncModals();
    const top = modalStack.length ? modalStack[modalStack.length - 1] : null;
    const ctx = {
      modal: top ? top.modal : null,
      focused: current,
      event,
      source,
      closeModal: () => top ? requestModalClose(top.modal) : void 0
    };
    if (emit("back", ctx)) return true;
    if (top && opts.closeModalOnBack) {
      requestModalClose(top.modal);
      return true;
    }
    return false;
  }
  function insideScope(el) {
    return !el || el === doc.body || el === doc.documentElement || scopeRoot.contains(el);
  }
  function onKeyDown(event) {
    if (!mounted || event.defaultPrevented) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    const action = normalizeKey(event, keymap);
    if (!action) return;
    const active = doc.activeElement;
    if (!insideScope(active)) return;
    if (isDirection(action)) {
      const owner = active && active !== doc.body ? arrowOwnership(active, action) : "sdk";
      if (owner === "native") return;
      if (event.repeat) {
        const t = now();
        if (t - lastRepeatMove < opts.repeatInterval) {
          if (current) event.preventDefault();
          return;
        }
        lastRepeatMove = t;
      }
      move(action);
      if (current) event.preventDefault();
      return;
    }
    if (action === "ok") {
      if (isTextEntry(active)) return;
      if (!current) return;
      event.preventDefault();
      if (event.repeat) return;
      activate({ source: "keyboard" });
      return;
    }
    if (action === "back") {
      if (isBackspace(event) && isTextEntry(active)) return;
      if (back({ event, source: "keyboard" })) event.preventDefault();
    }
  }
  function onFocusIn(event) {
    if (!mounted || internalFocus) return;
    const target = event.target;
    syncModals();
    const modal = topModal();
    if (modal && !modal.contains(target)) {
      const inside = current && modal.contains(current) && isUsableTarget(current) ? current : firstTargetIn(modal);
      if (inside) focusElement(inside, { source: "containment", scroll: false });
      return;
    }
    if (target !== current && isTarget(target)) {
      focusElement(target, { source: "native", scroll: false });
    }
  }
  function onDialogClose() {
    syncModals();
  }
  function onGamepad(action) {
    if (!mounted) return;
    if (isDirection(action)) move(action);
    else if (action === "ok") activate({ source: "gamepad" });
    else if (action === "back") back({ source: "gamepad" });
  }
  function onMutations(records) {
    if (!mounted || refreshQueued) return;
    const relevant = records.some((r) => !isOwnMutation(r));
    if (!relevant) return;
    refreshQueued = true;
    Promise.resolve().then(() => {
      refreshQueued = false;
      if (mounted) refresh();
    });
  }
  function isOwnMutation(record) {
    if (record.type !== "attributes") return false;
    if (record.attributeName === "tabindex") return addedTabindex.has(record.target);
    if (record.attributeName !== "class") return false;
    const strip = (value) => String(value || "").split(/\s+/).filter((c) => c && c !== opts.focusClass).sort().join(" ");
    return strip(record.oldValue) === strip(record.target.getAttribute("class"));
  }
  function refresh() {
    if (!mounted) return api;
    collect();
    syncModals();
    if (current && !currentIsValid()) relocate();
    else if (!current && opts.autoFocus) focusInitial();
    else if (current) setClass(current, true);
    return api;
  }
  function mount() {
    if (mounted) return api;
    mounted = true;
    disposers = [];
    if (opts.injectStyles) disposers.push(acquireStyle(doc, opts.focusClass));
    scopeRoot.setAttribute("data-dpad-bridge", "on");
    disposers.push(() => scopeRoot.removeAttribute("data-dpad-bridge"));
    if (opts.keyboard) listen(win, "keydown", onKeyDown);
    listen(doc, "focusin", onFocusIn);
    listen(doc, "close", onDialogClose, true);
    if (opts.observe && typeof win.MutationObserver === "function") {
      observer = new win.MutationObserver(onMutations);
      observer.observe(scopeRoot, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeOldValue: true,
        attributeFilter: OBSERVED_ATTRIBUTES
      });
      disposers.push(() => {
        observer.disconnect();
        observer = null;
      });
    }
    if (opts.gamepad) {
      poller = createGamepadPoller({
        win,
        onAction: onGamepad,
        repeatDelay: opts.repeatDelay,
        repeatInterval: opts.repeatInterval,
        ...typeof opts.gamepad === "object" ? opts.gamepad : {}
      });
      poller.attach();
      disposers.push(() => {
        poller.destroy();
        poller = null;
      });
    }
    refresh();
    return api;
  }
  function destroy() {
    if (!mounted) return api;
    mounted = false;
    for (const id of frames) win.cancelAnimationFrame(id);
    frames.clear();
    while (disposers.length) disposers.pop()();
    if (current) setClass(current, false);
    scopeRoot.querySelectorAll(`.${cssEscape(opts.focusClass)}`).forEach((el) => setClass(el, false));
    for (const el of addedTabindex) el.removeAttribute("tabindex");
    addedTabindex = /* @__PURE__ */ new Set();
    targets = [];
    current = null;
    lastRect = null;
    modalStack = [];
    focusHistory = [];
    groupMemory = /* @__PURE__ */ new WeakMap();
    lastActivation = { el: null, time: -Infinity };
    refreshQueued = false;
    return api;
  }
  const api = {
    mount,
    refresh,
    destroy,
    on,
    move,
    activate: () => activate({ source: "api" }),
    back: () => back({ source: "api" }),
    focus(ref) {
      if (!mounted) return false;
      const el = resolveElement(ref);
      if (!el || !isTarget(el)) return false;
      syncModals();
      if (!scope().contains(el)) return false;
      focusElement(el, { source: "api" });
      return true;
    },
    getFocused: () => current,
    getTargets: () => targets.filter((el) => isUsableTarget(el)),
    getModal: () => topModal(),
    get isMounted() {
      return mounted;
    },
    get root() {
      return scopeRoot;
    }
  };
  return api;
}

// src/index.js
var VERSION = "0.1.0";
export {
  DEFAULT_KEYMAP,
  DEFAULT_SELECTORS,
  DIRECTIONS,
  GROUP_ATTR,
  MODAL_SELECTOR,
  VERSION,
  arrowOwnership,
  collectTargets,
  createDPadBridge,
  createGamepadPoller,
  isUsableTarget,
  nearestCandidate,
  normalizeGamepad,
  normalizeKey,
  pickNext,
  revealElement,
  scoreCandidate,
  toRect
};
