import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickNext,
  scoreCandidate,
  nearestCandidate,
  toRect,
  isBeyond,
  primaryGap,
  opposite,
} from '../src/geometry.js';

const R = (id, x, y, w, h) => ({ id, rect: { left: x, top: y, width: w, height: h } });
const pick = (from, cands, dir) => {
  const src = cands.find((c) => c.id === from);
  const next = pickNext(src.rect, cands.filter((c) => c !== src), dir);
  return next ? next.id : null;
};

// 3x3 grid of 100x60 cells with 20px gaps.
const grid = [];
for (let r = 0; r < 3; r += 1) {
  for (let c = 0; c < 3; c += 1) grid.push(R(`${r}${c}`, c * 120, r * 80, 100, 60));
}

describe('grid', () => {
  test('moves one cell in every direction from the centre', () => {
    assert.equal(pick('11', grid, 'up'), '01');
    assert.equal(pick('11', grid, 'down'), '21');
    assert.equal(pick('11', grid, 'left'), '10');
    assert.equal(pick('11', grid, 'right'), '12');
  });

  test('stays in the same row/column instead of jumping diagonally', () => {
    assert.equal(pick('00', grid, 'right'), '01');
    assert.equal(pick('00', grid, 'down'), '10');
    assert.equal(pick('22', grid, 'left'), '21');
    assert.equal(pick('22', grid, 'up'), '12');
  });

  test('returns null at every edge (boundary)', () => {
    assert.equal(pick('00', grid, 'up'), null);
    assert.equal(pick('00', grid, 'left'), null);
    assert.equal(pick('22', grid, 'down'), null);
    assert.equal(pick('22', grid, 'right'), null);
  });
});

describe('single row and single column', () => {
  const row = [R('a', 0, 0, 80, 40), R('b', 100, 0, 80, 40), R('c', 200, 0, 80, 40), R('d', 300, 0, 80, 40)];
  const col = [R('a', 0, 0, 200, 40), R('b', 0, 60, 200, 40), R('c', 0, 120, 200, 40)];

  test('row walks left/right in order and has no vertical neighbour', () => {
    assert.equal(pick('a', row, 'right'), 'b');
    assert.equal(pick('b', row, 'right'), 'c');
    assert.equal(pick('d', row, 'left'), 'c');
    assert.equal(pick('b', row, 'up'), null);
    assert.equal(pick('b', row, 'down'), null);
  });

  test('column walks up/down in order and has no horizontal neighbour', () => {
    assert.equal(pick('a', col, 'down'), 'b');
    assert.equal(pick('c', col, 'up'), 'b');
    assert.equal(pick('b', col, 'left'), null);
    assert.equal(pick('b', col, 'right'), null);
  });
});

describe('uneven layouts', () => {
  // Wide header above three cards.
  const layout = [
    R('header', 0, 0, 900, 60),
    R('c1', 0, 100, 280, 200),
    R('c2', 310, 100, 280, 200),
    R('c3', 620, 100, 280, 200),
  ];

  test('down from a wide element picks the most centred aligned card', () => {
    assert.equal(pick('header', layout, 'down'), 'c2');
  });

  test('up from any card returns to the wide header', () => {
    assert.equal(pick('c1', layout, 'up'), 'header');
    assert.equal(pick('c3', layout, 'up'), 'header');
  });

  test('a tall item next to two short ones: right goes to the vertically aligned one', () => {
    const items = [R('tall', 0, 0, 100, 300), R('top', 120, 0, 100, 60), R('bottom', 120, 240, 100, 60)];
    // Both overlap the beam; the one whose centre is nearer wins.
    const fromTop = [R('src', 0, 220, 100, 80), R('top', 120, 0, 100, 60), R('bottom', 120, 240, 100, 60)];
    assert.equal(pick('src', fromTop, 'right'), 'bottom');
    // From the tall element, top & bottom are equally centred: earlier in DOM order wins.
    assert.equal(pick('tall', items, 'right'), 'top');
  });

  test('aligned-but-far loses to a much closer slightly offset target', () => {
    const items = [R('src', 0, 0, 100, 100), R('far', 0, 600, 100, 100), R('near', 110, 110, 100, 100)];
    assert.equal(pick('src', items, 'down'), 'near');
  });

  test('aligned target wins over an equally near diagonal one', () => {
    const items = [R('src', 0, 0, 100, 100), R('diag', 140, 120, 100, 100), R('below', 0, 120, 100, 100)];
    assert.equal(pick('src', items, 'down'), 'below');
  });
});

describe('ties are deterministic', () => {
  test('two mirror-image candidates resolve to DOM order', () => {
    const src = { left: 100, top: 0, width: 100, height: 50 };
    const left = R('left', 0, 100, 100, 50);
    const right = R('right', 200, 100, 100, 50);
    assert.equal(pickNext(src, [left, right], 'down').id, 'left');
    assert.equal(pickNext(src, [right, left], 'down').id, 'right');
  });

  test('the same input always yields the same answer', () => {
    const results = new Set();
    for (let i = 0; i < 50; i += 1) results.add(pick('11', grid, 'right'));
    assert.deepEqual([...results], ['12']);
  });
});

describe('overlap fallback', () => {
  test('a badge overlapping its card is still reachable when nothing is strictly beyond', () => {
    const card = R('card', 0, 0, 200, 200);
    const badge = R('badge', 150, 10, 80, 30);
    assert.equal(pickNext(card.rect, [badge], 'right').id, 'badge');
    assert.equal(pickNext(badge.rect, [card], 'left').id, 'card');
  });

  test('strict candidates are preferred over overlapping ones', () => {
    const src = R('src', 0, 0, 100, 100);
    const overlapping = R('o', 60, 0, 100, 100);
    const beyond = R('b', 200, 0, 100, 100);
    assert.equal(pickNext(src.rect, [overlapping, beyond], 'right').id, 'b');
  });
});

describe('scoring primitives', () => {
  test('primaryGap and isBeyond for each direction', () => {
    const a = toRect({ left: 100, top: 100, width: 50, height: 50 });
    const right = toRect({ left: 170, top: 100, width: 10, height: 10 });
    assert.equal(primaryGap(a, right, 'right'), 20);
    assert.equal(isBeyond(a, right, 'right'), true);
    assert.equal(isBeyond(a, right, 'left'), false);
    assert.equal(opposite('up'), 'down');
  });

  test('in-beam candidates have zero orthogonal gap and full overlap ratio', () => {
    const s = scoreCandidate(toRect(R('', 0, 0, 100, 50).rect), toRect(R('', 0, 70, 100, 50).rect), 'down');
    assert.equal(s.primary, 20);
    assert.equal(s.orthoGap, 0);
    assert.equal(s.overlapRatio, 1);
  });

  test('rejects unknown directions', () => {
    assert.throws(() => pickNext({ left: 0, top: 0, width: 1, height: 1 }, [], 'north'), TypeError);
  });

  test('nearestCandidate picks the closest box, ties in DOM order', () => {
    const lost = { left: 100, top: 100, width: 50, height: 50 };
    const a = R('a', 0, 0, 40, 40);
    const b = R('b', 160, 100, 40, 50);
    const c = R('c', 100, 300, 50, 50);
    assert.equal(nearestCandidate(lost, [a, b, c]).id, 'b');
    assert.equal(nearestCandidate(lost, []), null);
  });
});
