// Type definitions for dpad-bridge-sdk 0.1
export type Direction = 'up' | 'down' | 'left' | 'right';
export type Action = Direction | 'ok' | 'back';
export type InputSource = 'keyboard' | 'gamepad' | 'api';

export interface RectLike {
  left?: number; top?: number; x?: number; y?: number;
  width?: number; height?: number; right?: number; bottom?: number;
}
export interface Rect { left: number; top: number; right: number; bottom: number; width: number; height: number; }

export type Keymap = Partial<Record<Action, Array<string | number>>>;

export interface FocusEvent { element: Element; previous: Element | null; direction: Direction | null; source: string; }
export interface MoveEvent { from: Element | null; to: Element; direction: Direction; source: string; }
export interface ActivateEvent { element: Element; source: InputSource; }
export interface BoundaryEvent { element: Element; direction: Direction; }
export interface BackContext {
  /** The open modal (top of the stack), if any. */
  modal: Element | null;
  focused: Element | null;
  event: KeyboardEvent | null;
  source: InputSource;
  /** Ask the SDK to close the open modal (clicks [data-dpad-close] or calls dialog.close()). */
  closeModal(): void;
}
export interface ModalOpenEvent { modal: Element; returnFocus: Element | null; }
export interface ModalCloseEvent { modal: Element; restoredTo: Element | null; }

export interface GamepadOptions {
  deadzone?: number;
  getGamepads?: () => ArrayLike<Gamepad | null>;
  now?: () => number;
  requestFrame?: (cb: FrameRequestCallback) => number;
  cancelFrame?: (id: number) => void;
}

export interface DPadBridgeOptions {
  /** Container to make navigable (element, selector or document). Default: document.body. */
  root?: Element | Document | string;
  /** Replaces the default focusable selectors. */
  selectors?: string[];
  /** Added to the selectors. */
  extraSelectors?: string[];
  /** Class put on the single focused element. Default 'dpad-focus'. */
  focusClass?: string;
  initialFocus?: Element | string | null;
  /** Focus something on mount / when nothing is focused. Default true. */
  autoFocus?: boolean;
  /** Use a MutationObserver to refresh automatically. Default false. */
  observe?: boolean;
  /** Gamepad API support. Default true. Pass an object to tune it. */
  gamepad?: boolean | GamepadOptions;
  /** Keyboard / remote key handling. Default true. */
  keyboard?: boolean;
  scrollMode?: 'nearest' | 'center' | false;
  scrollMargin?: number;
  /** Default: 'smooth', or 'auto' when prefers-reduced-motion is set. */
  scrollBehavior?: 'auto' | 'smooth' | null;
  repeatDelay?: number;
  repeatInterval?: number;
  /** Minimum ms between two activations of the same element. Default 150. */
  activationGuard?: number;
  keymap?: Keymap | null;
  rememberGroupFocus?: boolean;
  closeModalOnBack?: boolean;
  modalSelector?: string;
  injectStyles?: boolean;
  /** DOM virtual cursor that follows focus (not the OS pointer). Default false. */
  virtualCursor?: boolean | { hideOnMouse?: boolean; followMs?: number };
  now?: () => number;
  onFocus?: (e: FocusEvent) => void;
  onMove?: (e: MoveEvent) => void;
  onActivate?: (e: ActivateEvent) => void;
  /** Return true when you handled Back; otherwise the default runs. */
  onBack?: (ctx: BackContext) => boolean | void;
  onBoundary?: (e: BoundaryEvent) => void;
  onModalOpen?: (e: ModalOpenEvent) => void;
  onModalClose?: (e: ModalCloseEvent) => void;
}

export interface DPadBridgeEvents {
  focus: FocusEvent;
  move: MoveEvent;
  activate: ActivateEvent;
  back: BackContext;
  boundary: BoundaryEvent;
  modalopen: ModalOpenEvent;
  modalclose: ModalCloseEvent;
}

export interface DPadBridge {
  mount(): DPadBridge;
  refresh(): DPadBridge;
  destroy(): DPadBridge;
  focus(target: Element | string): boolean;
  move(direction: Direction): boolean;
  activate(): boolean;
  back(): boolean;
  on<K extends keyof DPadBridgeEvents>(event: K, handler: (e: DPadBridgeEvents[K]) => unknown): () => void;
  getFocused(): Element | null;
  getTargets(): Element[];
  getModal(): Element | null;
  getCursor(): { visible: boolean; x: number | null; y: number | null; target: Element | null } | null;
  readonly isMounted: boolean;
  readonly root: Element;
}

export function createDPadBridge(options?: DPadBridgeOptions): DPadBridge;

export const DIRECTIONS: readonly Direction[];
export const DEFAULT_SELECTORS: readonly string[];
export const DEFAULT_KEYMAP: Readonly<Record<Action, ReadonlyArray<string | number>>>;
export const MODAL_SELECTOR: string;
export const GROUP_ATTR: string;
export const VERSION: string;

export interface Candidate { rect: RectLike; [key: string]: unknown; }
export function pickNext<T extends Candidate>(from: RectLike, candidates: T[], direction: Direction): T | null;
export function scoreCandidate(from: Rect, to: Rect, direction: Direction): {
  score: number; primary: number; orthoGap: number; centerOffset: number; overlapRatio: number;
};
export function nearestCandidate<T extends Candidate>(rect: RectLike, candidates: T[]): T | null;
export function toRect(r: RectLike): Rect;

export function collectTargets(root: ParentNode, selectors?: readonly string[]): Element[];
export function isUsableTarget(el: Element | null): boolean;
export function arrowOwnership(el: Element | null, direction: Direction): 'native' | 'sdk';

export function normalizeKey(event: Partial<KeyboardEvent> | null, keymap?: Keymap): Action | null;
export function normalizeGamepad(pad: Gamepad | null, options?: { deadzone?: number }): Record<Action, boolean>;
export interface GamepadPoller {
  readonly supported: boolean;
  readonly running: boolean;
  attach(): void; start(): void; stop(): void; poll(): void; destroy(): void;
}
export function createGamepadPoller(options: GamepadOptions & {
  win?: Window;
  onAction: (action: Action, info: { source: 'gamepad'; repeat: boolean }) => void;
  repeatDelay?: number;
  repeatInterval?: number;
}): GamepadPoller;

export function revealElement(el: Element, options?: { margin?: number; mode?: 'nearest' | 'center'; behavior?: 'auto' | 'smooth' }):
  Array<{ container: Element; dx: number; dy: number }>;

export function cursorPoint(rect: Rect, viewport: { width: number; height: number }): { x: number; y: number };
