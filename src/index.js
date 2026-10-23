/**
 * DPadBridge SDK: make ordinary DOM interfaces navigable with a TV remote
 * (D-pad) and a gamepad. Plain JavaScript, no framework, no network.
 */
export { createDPadBridge, MODAL_SELECTOR, GROUP_ATTR } from './bridge.js';
export {
  DIRECTIONS,
  pickNext,
  scoreCandidate,
  nearestCandidate,
  toRect,
} from './geometry.js';
export {
  DEFAULT_SELECTORS,
  collectTargets,
  isUsableTarget,
  arrowOwnership,
} from './targets.js';
export {
  DEFAULT_KEYMAP,
  normalizeKey,
  normalizeGamepad,
  createGamepadPoller,
} from './input.js';
export { revealElement } from './scroll.js';

export const VERSION = '0.1.0';
