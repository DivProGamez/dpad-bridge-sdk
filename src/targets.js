/**
 * Discovering navigable DOM targets and deciding who owns a key press when
 * focus is inside an editable control.
 */

/** Interactive elements DPadBridge navigates between by default. */
export const DEFAULT_SELECTORS = Object.freeze([
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[data-dpad-focusable]',
]);

/** Elements the browser can already focus without a tabindex. */
const NATIVELY_FOCUSABLE =
  'a[href], button, input, select, textarea, summary, iframe, [contenteditable=""], [contenteditable="true"]';

const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'password']);
const HORIZONTAL_NATIVE_TYPES = new Set([
  'range',
  'date',
  'time',
  'datetime-local',
  'month',
  'week',
]);

export function selectorString(selectors) {
  return (Array.isArray(selectors) ? selectors : [selectors]).filter(Boolean).join(', ');
}

/** All usable targets inside `root`, in DOM order. */
export function collectTargets(root, selectors = DEFAULT_SELECTORS) {
  const selector = selectorString(selectors);
  if (!selector) return [];
  return Array.from(root.querySelectorAll(selector)).filter((el) => isUsableTarget(el));
}

export function needsTabindex(el) {
  return !el.hasAttribute('tabindex') && !el.matches(NATIVELY_FOCUSABLE);
}

/**
 * True when the element can receive D-pad focus right now: connected, not
 * disabled, not hidden, not inert, not opted out, and actually rendered.
 */
export function isUsableTarget(el) {
  if (!el || !el.isConnected || el.nodeType !== 1) return false;
  if (el.getAttribute('data-dpad-focusable') === 'false') return false;
  if (el.closest('[data-dpad-ignore]')) return false;
  if (isDisabled(el)) return false;
  if (el.closest('[inert], [hidden], [aria-hidden="true"]')) return false;
  return isRendered(el);
}

export function isDisabled(el) {
  if (el.getAttribute('aria-disabled') === 'true') return true;
  try {
    if (el.matches(':disabled')) return true;
  } catch {
    /* very old engines: fall through to the attribute checks */
  }
  if ('disabled' in el && el.disabled === true) return true;
  const fieldset = el.closest('fieldset[disabled]');
  if (fieldset) {
    // Controls inside the fieldset's first <legend> stay enabled (HTML spec).
    const legend = fieldset.querySelector(':scope > legend');
    if (!(legend && legend.contains(el))) return true;
  }
  return false;
}

/** Has a box on screen (possibly scrolled out of view) and is not visibility:hidden. */
export function isRendered(el) {
  const view = el.ownerDocument && el.ownerDocument.defaultView;
  if (typeof el.checkVisibility === 'function') {
    if (!el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true })) return false;
  } else if (view) {
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      if (view.getComputedStyle(node).display === 'none') return false;
    }
    if (view.getComputedStyle(el).visibility === 'hidden') return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** Kind of editable control, or null for things that are not edited by typing. */
export function editableKind(el) {
  if (!el || el.nodeType !== 1) return null;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return 'multiline';
  if (tag === 'SELECT') return 'select';
  if (tag === 'INPUT') {
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (TEXT_INPUT_TYPES.has(type)) return 'text';
    if (type === 'number') return 'number';
    if (HORIZONTAL_NATIVE_TYPES.has(type)) return 'horizontal';
    return null; // checkbox, radio, button, submit, file, color...
  }
  if (el.isContentEditable || el.getAttribute('contenteditable') === 'true' || el.getAttribute('contenteditable') === '') {
    return 'contenteditable';
  }
  return null;
}

/** Controls where typed characters, Enter and Backspace belong to the user. */
export function isTextEntry(el) {
  const kind = editableKind(el);
  return kind === 'text' || kind === 'number' || kind === 'multiline' || kind === 'contenteditable';
}

function caret(el) {
  try {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (typeof start !== 'number' || typeof end !== 'number') return null;
    return { start, end, length: (el.value || '').length };
  } catch {
    return null;
  }
}

/**
 * Decide whether an arrow key pressed while `el` has focus should stay with
 * the control ('native') or move D-pad focus ('sdk').
 *
 * - text inputs: Up/Down navigate; Left/Right navigate only from the caret edge
 * - textarea: arrows edit; navigate only from the very start (Up/Left) or end (Down/Right)
 * - number: Up/Down step the value; Left/Right navigate
 * - range/date/time: Left/Right adjust the value; Up/Down navigate
 * - contenteditable: Left/Right edit; Up/Down navigate
 * - anything inside [data-dpad-passthrough]: always native
 */
export function arrowOwnership(el, direction) {
  if (!el || el.nodeType !== 1) return 'sdk';
  if (el.closest('[data-dpad-passthrough]')) return 'native';
  const kind = editableKind(el);
  const horizontal = direction === 'left' || direction === 'right';
  switch (kind) {
    case 'text': {
      if (!horizontal) return 'sdk';
      const c = caret(el);
      if (!c) return 'native';
      if (c.start !== c.end) return 'native';
      if (direction === 'left') return c.start === 0 ? 'sdk' : 'native';
      return c.end >= c.length ? 'sdk' : 'native';
    }
    case 'multiline': {
      const c = caret(el);
      if (!c || c.start !== c.end) return 'native';
      if (direction === 'up' || direction === 'left') return c.start === 0 ? 'sdk' : 'native';
      return c.end >= c.length ? 'sdk' : 'native';
    }
    case 'number':
      return horizontal ? 'sdk' : 'native';
    case 'horizontal':
    case 'contenteditable':
      return horizontal ? 'native' : 'sdk';
    default:
      return 'sdk';
  }
}
