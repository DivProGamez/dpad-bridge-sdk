/**
 * Focus-aware scrolling: bring the focused element into view inside every
 * scrollable ancestor (innermost first), keeping a small margin around it.
 */

const SCROLLABLE = /(auto|scroll|overlay)/;

function scrollingElementOf(doc) {
  return doc.scrollingElement || doc.documentElement;
}

// Prefer the longhand; fall back to the shorthand for engines that only resolve that.
function overflowOf(style, longhand) {
  const value = style[longhand];
  return value && value !== 'visible' ? value : style.overflow || '';
}

/** Scrollable ancestors of `el`, innermost first, ending with the document scroller. */
export function getScrollParents(el) {
  const doc = el.ownerDocument;
  const view = doc.defaultView;
  const docScroller = scrollingElementOf(doc);
  const parents = [];
  for (let node = el.parentElement; node && node !== docScroller; node = node.parentElement) {
    if (node === doc.body) continue;
    const style = view.getComputedStyle(node);
    const canY = SCROLLABLE.test(overflowOf(style, 'overflowY')) && node.scrollHeight > node.clientHeight;
    const canX = SCROLLABLE.test(overflowOf(style, 'overflowX')) && node.scrollWidth > node.clientWidth;
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
    right: left + (container.clientWidth || r.width),
  };
}

/** Delta needed on one axis to reveal [start, end] inside [viewStart, viewEnd]. */
export function axisDelta(start, end, viewStart, viewEnd, margin, mode) {
  const size = viewEnd - viewStart;
  const m = Math.max(0, Math.min(margin, (size - (end - start)) / 2));
  if (mode === 'center') {
    return start + (end - start) / 2 - (viewStart + size / 2);
  }
  if (start < viewStart + m) return start - (viewStart + m);
  if (end > viewEnd - m) {
    // Element bigger than the view: align its start instead of its end.
    if (end - start > size - 2 * m) return start - (viewStart + m);
    return end - (viewEnd - m);
  }
  return 0;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Reveal `el` inside all scrollable ancestors.
 *
 * @param {Element} el
 * @param {{margin?: number, mode?: 'nearest'|'center', behavior?: 'auto'|'smooth'}} [options]
 * @returns {Array<{container: Element, dx: number, dy: number}>} scrolls applied
 */
export function revealElement(el, { margin = 24, mode = 'nearest', behavior = 'auto' } = {}) {
  const doc = el.ownerDocument;
  const applied = [];
  const rect = el.getBoundingClientRect();
  // Track where the element *will* be after inner containers scroll, because
  // smooth scrolling has not moved anything yet when we measure outer ones.
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
    if (behavior === 'smooth' && typeof container.scrollTo === 'function') {
      container.scrollTo({ top: toY, left: toX, behavior: 'smooth' });
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
