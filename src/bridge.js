import { isBeyond, isDirection, nearestCandidate, perpendicularOverlap, pickNext, toRect } from './geometry.js';
import {
  DEFAULT_SELECTORS,
  arrowOwnership,
  collectTargets,
  editableKind,
  isTextEntry,
  isUsableTarget,
  needsTabindex,
  selectorString,
} from './targets.js';
import { createGamepadPoller, isBackspace, normalizeKey, resolveKeymap } from './input.js';
import { revealElement } from './scroll.js';

export const MODAL_SELECTOR = 'dialog[open], [aria-modal="true"], [data-dpad-modal]';
export const GROUP_ATTR = 'data-dpad-group';

const DEFAULTS = Object.freeze({
  selectors: DEFAULT_SELECTORS,
  extraSelectors: [],
  focusClass: 'dpad-focus',
  initialFocus: null,
  autoFocus: true,
  observe: false,
  gamepad: true,
  keyboard: true,
  scrollMode: 'nearest',
  scrollMargin: 24,
  scrollBehavior: null, // null = 'smooth', or 'auto' when the user prefers reduced motion
  repeatDelay: 400,
  repeatInterval: 120,
  activationGuard: 150,
  keymap: null,
  rememberGroupFocus: true,
  closeModalOnBack: true,
  modalSelector: MODAL_SELECTOR,
  injectStyles: true,
  now: null,
});

const EVENT_OPTIONS = {
  focus: 'onFocus',
  move: 'onMove',
  activate: 'onActivate',
  back: 'onBack',
  boundary: 'onBoundary',
  modalopen: 'onModalOpen',
  modalclose: 'onModalClose',
};

const OBSERVED_ATTRIBUTES = [
  'class',
  'style',
  'hidden',
  'disabled',
  'inert',
  'open',
  'href',
  'tabindex',
  'contenteditable',
  'aria-hidden',
  'aria-disabled',
  'aria-modal',
  'data-dpad-focusable',
  'data-dpad-ignore',
  'data-dpad-modal',
];

/* Shared, reference-counted focus stylesheet per document + class name. */
const styleRegistry = new WeakMap();

function focusCss(cls) {
  const c = `.${cssEscape(cls)}`;
  return `${c}{outline:var(--dpad-focus-width,4px) solid var(--dpad-focus-color,#ffd60a)!important;` +
    `outline-offset:var(--dpad-focus-offset,3px)!important;` +
    `box-shadow:0 0 0 calc(var(--dpad-focus-offset,3px) + var(--dpad-focus-width,4px) + 3px) var(--dpad-focus-halo,rgba(0,0,0,.85))}` +
    `@media (prefers-reduced-motion:no-preference){${c}{transition:outline-offset .12s ease-out,box-shadow .12s ease-out}}` +
    `@media (forced-colors:active){${c}{outline-color:Highlight!important;box-shadow:none}}`;
}

function cssEscape(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

function acquireStyle(doc, cls) {
  let byClass = styleRegistry.get(doc);
  if (!byClass) styleRegistry.set(doc, (byClass = new Map()));
  let entry = byClass.get(cls);
  if (!entry) {
    const el = doc.createElement('style');
    el.setAttribute('data-dpad-bridge-style', cls);
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
  if (typeof root === 'string') {
    if (typeof document === 'undefined') throw new TypeError('DPadBridge: a string root needs a global document');
    const el = document.querySelector(root);
    if (!el) throw new TypeError(`DPadBridge: root "${root}" not found`);
    return el;
  }
  if (root) return root;
  if (typeof document !== 'undefined' && document.body) return document.body;
  throw new TypeError('DPadBridge: no root element given');
}

/**
 * Create a D-pad / gamepad navigation bridge for the DOM inside `root`.
 * Nothing happens until `.mount()` is called.
 */
export function createDPadBridge(options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const root = resolveRoot(opts.root);
  const doc = root.nodeType === 9 ? root : root.ownerDocument;
  const win = doc.defaultView;
  const scopeRoot = root.nodeType === 9 ? doc.documentElement : root;
  const selectors = [].concat(opts.selectors || [], opts.extraSelectors || []);
  const selector = selectorString(selectors);
  const keymap = resolveKeymap(opts.keymap);
  const now = typeof opts.now === 'function' ? opts.now : () => (win.performance ? win.performance.now() : Date.now());

  const listeners = new Map();
  for (const [event, key] of Object.entries(EVENT_OPTIONS)) {
    if (typeof opts[key] === 'function') on(event, opts[key]);
  }

  let mounted = false;
  let targets = [];
  let current = null;
  let lastRect = null;
  let disposers = [];
  let modalStack = [];
  let focusHistory = [];
  let groupMemory = new WeakMap();
  let addedTabindex = new Set();
  let lastActivation = { el: null, time: -Infinity };
  let lastRepeatMove = -Infinity;
  let observer = null;
  let poller = null;
  let frames = new Set();
  let refreshQueued = false;
  let internalFocus = false;
  let syncing = false;

  /* ------------------------------------------------------------ events */

  function on(event, fn) {
    if (typeof fn !== 'function') throw new TypeError('DPadBridge.on: handler must be a function');
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => {
      const set = listeners.get(event);
      if (set) set.delete(fn);
    };
  }

  /** Call handlers; returns true if any handler returned exactly `true`. */
  function emit(event, detail) {
    const set = listeners.get(event);
    if (!set) return false;
    let handled = false;
    for (const fn of Array.from(set)) {
      try {
        if (fn(detail) === true) handled = true;
      } catch (err) {
        if (win.console) win.console.error('DPadBridge listener error', err);
      }
    }
    return handled;
  }

  function listen(target, type, fn, capture = false) {
    target.addEventListener(type, fn, capture);
    disposers.push(() => target.removeEventListener(type, fn, capture));
  }

  function frame(fn) {
    if (typeof win.requestAnimationFrame !== 'function') return;
    const id = win.requestAnimationFrame(() => {
      frames.delete(id);
      if (mounted) fn();
    });
    frames.add(id);
  }

  /* ------------------------------------------------------------ targets */

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
    const preferred = container.querySelector('[data-dpad-autofocus], [data-dpad-initial], [autofocus]');
    if (preferred && isTarget(preferred)) return preferred;
    return targets.find((el) => container.contains(el) && isUsableTarget(el)) || null;
  }

  /** Re-query targets (DOM order) and give non-native focusables a tabindex. */
  function collect() {
    targets = selector ? collectTargets(scopeRoot, selectors) : [];
    for (const el of targets) {
      if (needsTabindex(el)) {
        el.setAttribute('tabindex', '0');
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
    if (typeof ref === 'string') {
      try {
        return doc.querySelector(ref);
      } catch {
        return null;
      }
    }
    return ref.nodeType === 1 ? ref : null;
  }

  /* ------------------------------------------------------------ focus */

  function setClass(el, add) {
    if (!el || !el.classList) return;
    if (add) el.classList.add(opts.focusClass);
    else el.classList.remove(opts.focusClass);
  }

  function scrollBehavior() {
    if (opts.scrollBehavior) return opts.scrollBehavior;
    const reduce = typeof win.matchMedia === 'function' && win.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return reduce ? 'auto' : 'smooth';
  }

  function focusElement(el, { direction = null, source = 'api', scroll = true } = {}) {
    const previous = current;
    if (previous && previous !== el) setClass(previous, false);
    current = el;
    setClass(el, true);
    if (doc.activeElement !== el && typeof el.focus === 'function') {
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
    emit('focus', { element: el, previous, direction, source });
    if (direction) emit('move', { from: previous, to: el, direction, source });
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
    if (el) focusElement(el, { source: 'initial' });
    return el;
  }

  /** Re-home focus when the focused element vanished, using its last known rectangle. */
  function relocate() {
    const container = scope();
    const cands = candidatesIn(container, null);
    const near = lastRect ? nearestCandidate(lastRect, cands) : null;
    if (near) focusElement(near.element, { source: 'relocate' });
    else if (cands.length) focusElement(cands[0].element, { source: 'relocate' });
    else clearFocus();
  }

  function currentIsValid() {
    return !!current && current.isConnected && isUsableTarget(current) && scope().contains(current);
  }

  /* ------------------------------------------------------------ modals */

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
    if (m.closest('[hidden], [inert]')) return false;
    if (m.tagName === 'DIALOG' && !m.open && !m.hasAttribute('open')) return false;
    const view = win;
    for (let node = m; node && node.nodeType === 1; node = node.parentElement) {
      const style = view.getComputedStyle(node);
      if (style.display === 'none') return false;
    }
    return view.getComputedStyle(m).visibility !== 'hidden';
  }

  function syncModals() {
    if (!mounted || syncing) return;
    syncing = true;
    try {
      const open = openModals();
      const changed =
        open.length !== modalStack.length || open.some((m) => !modalStack.some((e) => e.modal === m));
      // A modal's content was usually hidden at the last refresh: re-collect.
      if (changed) collect();
      // Closed modals, top of the stack first.
      for (let i = modalStack.length - 1; i >= 0; i -= 1) {
        const entry = modalStack[i];
        if (open.includes(entry.modal)) continue;
        modalStack.splice(i, 1);
        restoreAfterModal(entry);
      }
      // Newly opened modals, in DOM order (later = on top).
      for (const modal of open) {
        if (modalStack.some((e) => e.modal === modal)) continue;
        const returnFocus = [...focusHistory].reverse().find((el) => el.isConnected && !modal.contains(el)) || null;
        const entry = {
          modal,
          returnFocus,
          returnRect: returnFocus ? toRect(returnFocus.getBoundingClientRect()) : lastRect,
        };
        modalStack.push(entry);
        if (!(current && modal.contains(current) && isUsableTarget(current))) {
          const inside = firstTargetIn(modal);
          if (inside) focusElement(inside, { source: 'modal' });
        }
        emit('modalopen', { modal, returnFocus });
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
      const declared = resolveElement(modal.getAttribute('data-dpad-restore'));
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
      if (restoredTo) focusElement(restoredTo, { source: 'restore' });
      else clearFocus();
    } else {
      restoredTo = current;
    }
    emit('modalclose', { modal, restoredTo });
  }

  function requestModalClose(modal) {
    const closer = modal.querySelector('[data-dpad-close]');
    if (closer && isUsableTarget(closer)) {
      closer.click();
    } else if (typeof modal.close === 'function') {
      modal.close();
    } else {
      // Custom modal without a close button: let the app decide.
      modal.dispatchEvent(new win.CustomEvent('dpad:close', { bubbles: true }));
    }
    syncModals();
  }

  /* ------------------------------------------------------------ actions */

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
    if (explicit === 'none') {
      emit('boundary', { element: current, direction });
      return false;
    }
    if (explicit) {
      const target = resolveElement(explicit);
      if (target && isTarget(target) && container.contains(target)) {
        focusElement(target, { direction, source: 'explicit' });
        return true;
      }
    }

    const from = toRect(current.getBoundingClientRect());
    const cands = candidatesIn(container, current);
    const group = groupOf(current);
    let next = null;
    if (group) next = pickNext(from, cands.filter((c) => c.group === group), direction);
    if (!next) {
      // Leaving a group: only targets that share the source's beam qualify, so
      // focus never jumps diagonally into an unrelated panel.
      const pool = group
        ? cands.filter((c) => c.group !== group && perpendicularOverlap(from, c.rect, direction) > 0)
        : cands;
      next = pickNext(from, pool, direction);
      // Still nothing: allow another panel that as a whole lies in this direction
      // and lines up with the source (e.g. a filtered grid whose only card is offset).
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
      emit('boundary', { element: current, direction });
      return false;
    }
    focusElement(next.element, { direction, source: 'navigation' });
    return true;
  }

  function activate({ source = 'api' } = {}) {
    if (!mounted) return false;
    syncModals();
    if (!currentIsValid()) return false;
    const el = current;
    const t = now();
    if (lastActivation.el === el && t - lastActivation.time < opts.activationGuard) return false;
    lastActivation = { el, time: t };

    const kind = editableKind(el);
    if (kind === 'select') {
      let opened = false;
      if (typeof el.showPicker === 'function') {
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
    emit('activate', { element: el, source });
    syncModals();
    frame(syncModals);
    return true;
  }

  function back({ event = null, source = 'api' } = {}) {
    if (!mounted) return false;
    syncModals();
    const top = modalStack.length ? modalStack[modalStack.length - 1] : null;
    const ctx = {
      modal: top ? top.modal : null,
      focused: current,
      event,
      source,
      closeModal: () => (top ? requestModalClose(top.modal) : undefined),
    };
    if (emit('back', ctx)) return true;
    if (top && opts.closeModalOnBack) {
      requestModalClose(top.modal);
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------ DOM listeners */

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
      const owner = active && active !== doc.body ? arrowOwnership(active, action) : 'sdk';
      if (owner === 'native') return;
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

    if (action === 'ok') {
      if (isTextEntry(active)) return; // Enter submits forms / adds new lines natively.
      if (!current) return;
      event.preventDefault(); // We activate exactly once via element.click().
      if (event.repeat) return;
      activate({ source: 'keyboard' });
      return;
    }

    if (action === 'back') {
      if (isBackspace(event) && isTextEntry(active)) return; // Deleting text, not Back.
      if (back({ event, source: 'keyboard' })) event.preventDefault();
    }
  }

  function onFocusIn(event) {
    if (!mounted || internalFocus) return;
    const target = event.target;
    syncModals();
    const modal = topModal();
    if (modal && !modal.contains(target)) {
      // Intentional modal containment: focus escaped the open modal.
      const inside = current && modal.contains(current) && isUsableTarget(current) ? current : firstTargetIn(modal);
      if (inside) focusElement(inside, { source: 'containment', scroll: false });
      return;
    }
    if (target !== current && isTarget(target)) {
      focusElement(target, { source: 'native', scroll: false });
    }
  }

  function onDialogClose() {
    syncModals();
  }

  function onGamepad(action) {
    if (!mounted) return;
    if (isDirection(action)) move(action);
    else if (action === 'ok') activate({ source: 'gamepad' });
    else if (action === 'back') back({ source: 'gamepad' });
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
    if (record.type !== 'attributes') return false;
    if (record.attributeName === 'tabindex') return addedTabindex.has(record.target);
    if (record.attributeName !== 'class') return false;
    const strip = (value) =>
      String(value || '')
        .split(/\s+/)
        .filter((c) => c && c !== opts.focusClass)
        .sort()
        .join(' ');
    return strip(record.oldValue) === strip(record.target.getAttribute('class'));
  }

  /* ------------------------------------------------------------ lifecycle */

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
    scopeRoot.setAttribute('data-dpad-bridge', 'on');
    disposers.push(() => scopeRoot.removeAttribute('data-dpad-bridge'));
    if (opts.keyboard) listen(win, 'keydown', onKeyDown);
    listen(doc, 'focusin', onFocusIn);
    listen(doc, 'close', onDialogClose, true);
    if (opts.observe && typeof win.MutationObserver === 'function') {
      observer = new win.MutationObserver(onMutations);
      observer.observe(scopeRoot, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeOldValue: true,
        attributeFilter: OBSERVED_ATTRIBUTES,
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
        ...(typeof opts.gamepad === 'object' ? opts.gamepad : {}),
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
    for (const el of addedTabindex) el.removeAttribute('tabindex');
    addedTabindex = new Set();
    targets = [];
    current = null;
    lastRect = null;
    modalStack = [];
    focusHistory = [];
    groupMemory = new WeakMap();
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
    activate: () => activate({ source: 'api' }),
    back: () => back({ source: 'api' }),
    focus(ref) {
      if (!mounted) return false;
      const el = resolveElement(ref);
      if (!el || !isTarget(el)) return false;
      syncModals();
      if (!scope().contains(el)) return false;
      focusElement(el, { source: 'api' });
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
    },
  };
  return api;
}
