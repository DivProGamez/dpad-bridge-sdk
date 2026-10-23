/**
 * Pure geometry for spatial (D-pad) navigation.
 *
 * Nothing in this file touches the DOM: every function takes plain rectangles
 * ({ left, top, right, bottom, width, height }) so the scoring rules can be
 * unit-tested exactly and reused outside a browser.
 */

export const DIRECTIONS = Object.freeze(['up', 'down', 'left', 'right']);

/** Pixels a candidate may overlap the source edge and still count as "beyond" it. */
export const EDGE_TOLERANCE = 1;
/** Weight applied to the perpendicular gap of candidates outside the source's "beam". */
export const ORTHO_WEIGHT = 4;
/** Weight applied to the perpendicular distance between centres. */
export const CENTER_WEIGHT = 0.25;
/** Score bonus (in px) for a candidate that fully overlaps the source's beam. */
export const ALIGN_BONUS = 20;
/** Scores closer than this are treated as a tie and resolved by the tie-break chain. */
export const TIE_EPSILON = 0.5;

const HORIZONTAL = { left: true, right: true, up: false, down: false };

/**
 * Normalise anything rect-like (DOMRect, {x, y, width, height}, ...) into a
 * plain frozen object with all six edges.
 */
export function toRect(r) {
  const left = num(r.left ?? r.x);
  const top = num(r.top ?? r.y);
  const width = num(r.width ?? num(r.right) - left);
  const height = num(r.height ?? num(r.bottom) - top);
  return Object.freeze({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  });
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function isDirection(value) {
  return DIRECTIONS.includes(value);
}

export function opposite(direction) {
  return { up: 'down', down: 'up', left: 'right', right: 'left' }[direction];
}

/**
 * Distance from the source's leading edge to the candidate's near edge,
 * measured along the direction of travel. Negative when the candidate starts
 * behind the source edge (i.e. overlaps it).
 */
export function primaryGap(from, to, direction) {
  switch (direction) {
    case 'right':
      return to.left - from.right;
    case 'left':
      return from.left - to.right;
    case 'down':
      return to.top - from.bottom;
    case 'up':
      return from.top - to.bottom;
    default:
      throw new TypeError(`Unknown direction: ${direction}`);
  }
}

/**
 * Overlap of the two rectangles on the axis perpendicular to travel.
 * Positive = they share that much of the "beam"; negative = the gap between them.
 */
export function perpendicularOverlap(from, to, direction) {
  return HORIZONTAL[direction]
    ? Math.min(from.bottom, to.bottom) - Math.max(from.top, to.top)
    : Math.min(from.right, to.right) - Math.max(from.left, to.left);
}

function centerOffset(from, to, direction) {
  return HORIZONTAL[direction]
    ? Math.abs(from.top + from.height / 2 - (to.top + to.height / 2))
    : Math.abs(from.left + from.width / 2 - (to.left + to.width / 2));
}

/** Strict test: the candidate lies beyond the source's leading edge. */
export function isBeyond(from, to, direction, tolerance = EDGE_TOLERANCE) {
  return primaryGap(from, to, direction) >= -tolerance;
}

/**
 * Loose test used only when no candidate passes the strict test (overlapping
 * layouts, e.g. a badge sitting on top of a card): the candidate's centre and
 * far edge must both have moved in the direction of travel.
 */
export function isLooselyBeyond(from, to, direction) {
  const fcx = from.left + from.width / 2;
  const fcy = from.top + from.height / 2;
  const tcx = to.left + to.width / 2;
  const tcy = to.top + to.height / 2;
  switch (direction) {
    case 'right':
      return tcx > fcx + EDGE_TOLERANCE && to.right > from.right;
    case 'left':
      return tcx < fcx - EDGE_TOLERANCE && to.left < from.left;
    case 'down':
      return tcy > fcy + EDGE_TOLERANCE && to.bottom > from.bottom;
    case 'up':
      return tcy < fcy - EDGE_TOLERANCE && to.top < from.top;
    default:
      throw new TypeError(`Unknown direction: ${direction}`);
  }
}

/**
 * Score one candidate. Lower is better.
 *
 *   score = primaryGap + ORTHO_WEIGHT * orthoGap + CENTER_WEIGHT * centerOffset
 *           - ALIGN_BONUS * overlapRatio
 *
 * - primaryGap: edge-to-edge distance along the direction (never negative).
 * - orthoGap: perpendicular gap; 0 when the candidate is inside the beam.
 * - centerOffset: perpendicular distance between centres (prefers the most
 *   centred of several aligned candidates, e.g. below a wide header).
 * - overlapRatio: 0..1 share of the smaller rect covered by the beam.
 */
export function scoreCandidate(from, to, direction) {
  const primary = Math.max(0, primaryGap(from, to, direction));
  const overlap = perpendicularOverlap(from, to, direction);
  const orthoGap = Math.max(0, -overlap);
  const smaller = HORIZONTAL[direction]
    ? Math.min(from.height, to.height)
    : Math.min(from.width, to.width);
  const overlapRatio = smaller > 0 ? Math.min(1, Math.max(0, overlap) / smaller) : 0;
  const offset = centerOffset(from, to, direction);
  const score =
    primary + ORTHO_WEIGHT * orthoGap + CENTER_WEIGHT * offset - ALIGN_BONUS * overlapRatio;
  return { score, primary, orthoGap, centerOffset: offset, overlapRatio };
}

/**
 * Pick the best candidate in `direction` from `from`.
 *
 * @param {object} from  source rect
 * @param {Array<{rect: object}>} candidates  in DOM order (used as the final tie-break)
 * @param {'up'|'down'|'left'|'right'} direction
 * @returns {object|null} the winning candidate object (not a copy), or null at a boundary
 */
export function pickNext(from, candidates, direction) {
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

/** Shortest distance between two rectangles (0 when they touch or overlap). */
export function rectDistance(a, b) {
  const dx = Math.max(0, a.left - b.right, b.left - a.right);
  const dy = Math.max(0, a.top - b.bottom, b.top - a.bottom);
  return Math.hypot(dx, dy);
}

/**
 * Candidate closest to `rect` in any direction (used to re-home focus when
 * the focused element disappears). Ties resolve to the earlier candidate.
 */
export function nearestCandidate(rect, candidates) {
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
      index,
    ];
    if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
      best = c;
      bestKey = key;
    }
  });
  return best;
}
