/**
 * Virtual cursor: a DOM overlay pointer that follows D-pad / gamepad focus.
 *
 * Browsers do not let JavaScript move the operating system's mouse pointer,
 * so this is a purely visual element drawn by the page. It never receives
 * events (pointer-events: none) and hides itself as soon as a real mouse is
 * used, handing control back to the native cursor.
 */

/** Size of the overlay box and where the arrow's tip sits inside it (px). */
export const CURSOR_SIZE = 32;
export const CURSOR_TIP = Object.freeze({ x: 4, y: 2 });

const POINTER_SVG =
  '<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false">' +
  '<path d="M4 2 L4 26 L10.5 20 L15 30 L19.6 28 L15.2 18.6 L24 18.6 Z" ' +
  'fill="var(--dpad-cursor-color,#ffc23d)" stroke="var(--dpad-cursor-outline,#14100a)" ' +
  'stroke-width="2" stroke-linejoin="round"/></svg>';

const CSS =
  '.dpad-cursor{position:fixed;left:0;top:0;width:32px;height:32px;z-index:2147483647;' +
  'pointer-events:none;opacity:0;transform:translate(-100px,-100px);' +
  'filter:drop-shadow(0 2px 6px rgba(0,0,0,.55));transition:opacity .12s ease-out}' +
  '.dpad-cursor.is-visible{opacity:1}' +
  '@media (prefers-reduced-motion:no-preference){.dpad-cursor.is-animated{' +
  'transition:transform .16s ease-out,opacity .12s ease-out}}' +
  '[data-dpad-input="controller"],[data-dpad-input="controller"] *{cursor:none!important}';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Where the arrow's tip goes for a target rectangle: just inside the
 * bottom-right corner, so the arrow body hangs outside the element and does
 * not cover centred or left-aligned text. Clamped so the whole pointer stays
 * inside the viewport.
 */
export function cursorPoint(rect, viewport) {
  const insetX = Math.min(14, rect.width * 0.15);
  const insetY = Math.min(14, rect.height * 0.15);
  return {
    x: clamp(rect.right - insetX, CURSOR_TIP.x, viewport.width - (CURSOR_SIZE - CURSOR_TIP.x)),
    y: clamp(rect.bottom - insetY, CURSOR_TIP.y, viewport.height - (CURSOR_SIZE - CURSOR_TIP.y)),
  };
}

/**
 * @param {object} o
 * @param {Document} o.doc
 * @param {Element} o.root          element that gets data-dpad-input="controller" while visible
 * @param {() => Element|null} o.getHost  container to live in (an open modal sits in the top layer)
 * @param {(target, type, fn, capture?) => void} o.listen  registers a listener with a disposer
 * @param {boolean} [o.hideOnMouse=true]
 * @param {number} [o.followMs=450]  keep re-measuring this long after a move (smooth scrolling)
 */
export function createVirtualCursor({ doc, root, getHost, listen, hideOnMouse = true, followMs = 450 }) {
  const win = doc.defaultView;
  const node = doc.createElement('div');
  node.className = 'dpad-cursor';
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('data-dpad-ignore', '');
  node.innerHTML = POINTER_SVG;
  const style = doc.createElement('style');
  style.setAttribute('data-dpad-cursor-style', '');
  style.textContent = CSS;
  (doc.head || doc.documentElement).appendChild(style);

  const state = { visible: false, target: null, x: null, y: null };
  let followUntil = 0;
  let frame = null;
  let lastPointer = null;

  const now = () => (win.performance ? win.performance.now() : Date.now());

  function ensureHost() {
    const host = (getHost && getHost()) || doc.body;
    if (node.parentNode !== host) host.appendChild(node);
  }

  function place() {
    const el = state.target;
    if (!el || !el.isConnected) return;
    const rect = el.getBoundingClientRect();
    const viewport = {
      width: win.innerWidth || doc.documentElement.clientWidth || 0,
      height: win.innerHeight || doc.documentElement.clientHeight || 0,
    };
    const p = cursorPoint(rect, viewport);
    state.x = p.x;
    state.y = p.y;
    node.style.transform = `translate(${Math.round(p.x - CURSOR_TIP.x)}px, ${Math.round(p.y - CURSOR_TIP.y)}px)`;
  }

  function follow() {
    frame = null;
    place();
    if (now() < followUntil && typeof win.requestAnimationFrame === 'function') {
      frame = win.requestAnimationFrame(follow);
    }
  }

  function track(el) {
    state.target = el;
    ensureHost();
    place();
    followUntil = now() + followMs;
    if (frame == null && typeof win.requestAnimationFrame === 'function') frame = win.requestAnimationFrame(follow);
  }

  function show() {
    if (state.visible) return;
    state.visible = true;
    ensureHost();
    place();
    node.classList.add('is-visible');
    // Animate moves only once the pointer is already on screen (no fly-in from 0,0).
    if (typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(() => node.classList.add('is-animated'));
    else node.classList.add('is-animated');
    root.setAttribute('data-dpad-input', 'controller');
  }

  function hide() {
    if (!state.visible) return;
    state.visible = false;
    node.classList.remove('is-visible', 'is-animated');
    root.removeAttribute('data-dpad-input');
  }

  function onPointerMove(event) {
    if (event.pointerType === 'touch') return;
    const pos = { x: event.clientX, y: event.clientY };
    const moved =
      Math.abs(event.movementX || 0) + Math.abs(event.movementY || 0) > 3 ||
      (lastPointer && Math.abs(pos.x - lastPointer.x) + Math.abs(pos.y - lastPointer.y) > 3);
    lastPointer = pos;
    if (moved) hide(); // a real mouse took over: give the native cursor back
  }

  listen(doc, 'scroll', () => state.visible && place(), true);
  listen(win, 'resize', () => state.visible && place());
  if (hideOnMouse) {
    listen(doc, 'pointermove', onPointerMove, true);
    listen(doc, 'pointerdown', hide, true);
  }

  return {
    node,
    track,
    show,
    hide,
    /** Re-host (e.g. a modal opened or closed) and re-measure. */
    refresh() {
      ensureHost();
      place();
    },
    state: () => ({ ...state }),
    destroy() {
      if (frame != null && typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(frame);
      frame = null;
      root.removeAttribute('data-dpad-input');
      node.remove();
      style.remove();
      state.target = null;
      state.visible = false;
    },
  };
}
