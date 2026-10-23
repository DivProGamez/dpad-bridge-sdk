// Test harness: jsdom has no layout engine, so elements describe their own
// geometry with data attributes and we stub the measuring APIs from them.
//
//   data-rect="x,y,width,height"   page-space box (getBoundingClientRect)
//   data-scroll="scrollHeight"     makes the element a vertical scroll container
//
// getBoundingClientRect() subtracts the scroll offsets of scrolling ancestors,
// exactly like a browser, so scroll-reveal logic can be tested for real.
import { JSDOM } from 'jsdom';

export function setup(html, { visualViewport = [1280, 720] } = {}) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${html}</body></html>`, {
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const { document } = window;
  Object.defineProperty(window, 'innerWidth', { value: visualViewport[0], configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: visualViewport[1], configurable: true });

  const proto = window.Element.prototype;
  proto.getBoundingClientRect = function getBoundingClientRect() {
    const spec = this.getAttribute('data-rect');
    if (!spec || hiddenByDisplay(window, this)) return rect(0, 0, 0, 0);
    let [x, y, w, h] = spec.split(',').map(Number);
    for (let p = this.parentElement; p; p = p.parentElement) {
      if (p.hasAttribute('data-scroll')) {
        y -= p.scrollTop;
        x -= p.scrollLeft;
      }
    }
    return rect(x, y, w, h);
  };

  for (const el of document.querySelectorAll('[data-scroll]')) makeScrollable(el);

  return {
    dom,
    window,
    document,
    $: (sel) => document.querySelector(sel),
    $$: (sel) => Array.from(document.querySelectorAll(sel)),
    press: (key, init = {}) => press(window, key, init),
    makeScrollable,
    close: () => window.close(),
  };
}

const KEY_CODES = {
  ArrowUp: 38,
  ArrowDown: 40,
  ArrowLeft: 37,
  ArrowRight: 39,
  Enter: 13,
  Escape: 27,
  Backspace: 8,
};

/** Dispatch a keydown on the focused element (bubbles to window like a real key). */
export function press(window, key, init = {}) {
  const target = window.document.activeElement || window.document.body;
  const event = new window.KeyboardEvent('keydown', {
    key,
    keyCode: KEY_CODES[key] ?? init.keyCode ?? 0,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

function makeScrollable(el) {
  const [, , , h] = (el.getAttribute('data-rect') || '0,0,0,0').split(',').map(Number);
  const scrollHeight = Number(el.getAttribute('data-scroll'));
  let top = 0;
  let left = 0;
  el.style.overflow = 'auto';
  Object.defineProperty(el, 'scrollTop', {
    get: () => top,
    set: (v) => {
      top = Math.max(0, Math.min(v, scrollHeight - h));
    },
    configurable: true,
  });
  Object.defineProperty(el, 'scrollLeft', { get: () => left, set: (v) => (left = Math.max(0, v)), configurable: true });
  Object.defineProperty(el, 'scrollHeight', { get: () => scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { get: () => h, configurable: true });
  Object.defineProperty(el, 'scrollWidth', { get: () => 0, configurable: true });
  Object.defineProperty(el, 'clientWidth', { get: () => 0, configurable: true });
}

function hiddenByDisplay(window, el) {
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    if (window.getComputedStyle(n).display === 'none') return true;
  }
  return false;
}

function rect(x, y, width, height) {
  return { x, y, left: x, top: y, width, height, right: x + width, bottom: y + height };
}

/** Builds `data-rect` grids quickly: grid(3, 3, {w, h, gap}) → [{id, rect}] */
export function gridHtml(cols, rows, { w = 100, h = 60, gap = 20, x0 = 0, y0 = 0, tag = 'button' } = {}) {
  let html = '';
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = x0 + c * (w + gap);
      const y = y0 + r * (h + gap);
      html += `<${tag} id="c${r}${c}" data-rect="${x},${y},${w},${h}">${r}${c}</${tag}>`;
    }
  }
  return html;
}
