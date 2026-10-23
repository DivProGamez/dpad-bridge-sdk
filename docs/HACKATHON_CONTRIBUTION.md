# Hackathon contribution: DPadBridge SDK

**Event:** Amazon Developer Hackathon 2026, Open Source Mini Challenge
**Author:** DivProGamez (independent developer)
**Repository:** https://github.com/DivProGamez/dpad-bridge-sdk
**License:** MIT

## What is new

DPadBridge is a new, standalone, MIT-licensed JavaScript SDK written for this challenge. It is a separate developer tool. It is **not** part of, and does not reuse code from, the author's primary-track projects (PlanB Orchestra and PressPath TV). Everything in this repository was written from scratch:

- **Spatial focus engine** (`src/geometry.js`): pure, deterministic directional scoring over real DOM rectangles. It uses a strict direction filter with an overlap fallback, a beam/alignment-aware score and a documented tie-break chain.
- **Panel-aware navigation** (`data-dpad-group`): stays inside a panel when possible, leaves only to lined-up targets (no diagonal jumps into unrelated panels), and remembers the last item per panel.
- **Target discovery** (`src/targets.js`): applies the real-world exclusion rules (disabled, `fieldset[disabled]`, `aria-disabled`, `hidden`, `inert`, `aria-hidden`, CSS-hidden, zero-size) and opt-in `data-dpad-focusable` for mouse-first `<div onclick>` UIs.
- **Input adapters** (`src/input.js`): a TV-remote keymap (arrows, Enter, Escape/GoBack/BrowserBack, webOS 461, Tizen 10009) that never touches unmapped keys, plus a Gamepad API poller with edge detection, dead zone and held-direction auto-repeat that only runs while a pad is connected.
- **Safe activation and Back**: OK runs the element's native `click()` exactly once, with no native and synthetic double fire and no machine-gunning from key repeat. Back goes through a callback, then closes a modal, then falls through to the platform, so it is never trapped.
- **Modal management**: detection of `<dialog>`, `aria-modal` and `data-dpad-modal`, focus moved inside, arrow and Tab containment, and restoration to the opener (or a declared target) on close.
- **Focus-aware scrolling** (`src/scroll.js`) across nested scroll containers with margins, `nearest`/`center` modes and `prefers-reduced-motion` support.
- **Lifecycle**: `mount`, `refresh`, optional MutationObserver auto-refresh (filters its own writes to avoid loops), `destroy` that leaves zero listeners, classes, styles or attributes behind.
- **Before/after demo**: an original mouse-first recipe app ("Saffron Kitchen"), styled as a cinematic 16:9 TV screen with photo recipe cards, a recipe dialog, a 30-item shopping list and a developer view of live SDK events. One switch mounts or destroys the SDK on the *same* DOM.

## How it works (short)

1. `createDPadBridge({ root }).mount()` collects targets and focuses the first one, giving it real DOM focus plus a high-contrast outline class.
2. A key press or gamepad input is normalised to `up/down/left/right/ok/back`. Arrows score every visible target in the current scope (the open modal, or the root) and focus the winner, scrolling it into view. OK calls `click()`. Back runs the callback/modal/platform chain.
3. DOM changes are picked up by `refresh()` or the optional observer. If the focused element disappears, focus moves to the nearest remaining target rather than being lost.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the scoring formula and event flow.

## Why it matters for TV developers

TV web apps, including HTML5 apps packaged for Fire TV, are driven by a five-way remote, not a mouse. Plenty of small web apps and prototypes start mouse-first, and retrofitting remote support usually means a framework migration or a pile of hand-written focus maps. DPadBridge offers a drop-in, framework-free layer that:

- works on the DOM the app already has, with one attribute for `<div>` cards
- keeps native semantics (real focus, native activation, Tab order, form typing) instead of faking them with an overlay
- handles the parts that usually go wrong: Back behaviour, modal focus return, scrolling long lists, text inputs and teardown
- runs offline as a single ~43 KiB unminified file (`dist/dpad-bridge.js`), with no network and no dependencies

## What was actually tested

All numbers below are from real runs in this repository's cloud development environment (Node 22, Linux).

| Suite | Command | Result |
| --- | --- | --- |
| Unit (node:test + jsdom 29) | `npm test` | **84 tests, 84 passed, 0 failed**, plus a `dist/` freshness check |
| Browser E2E (Playwright 1.56.1, headless Chromium 141) | `npm run test:e2e` | **17 tests, 17 passed, 0 failed**. Also run with `--repeat-each=3`: 51 passed |

The unit tests cover the cases listed in the README: directional selection on grids, rows, columns, uneven layouts and ties; invisible and disabled exclusion; boundaries without focus loss; `refresh()` and observer mode; single activation; Back callback and fall-through; modal containment and restoration; scroll reveal; listener cleanup after `destroy()`; text-input safety; and gamepad normalisation and repeat with mocked `Gamepad` objects.

The E2E tests drive the real demo page in Chromium: before vs after, navigation over the real CSS layout, dialog open/contain/Back/restore, exactly one activation per Enter (including held Enter), list scroll reveal, typing in search, filter-driven DOM updates, the demo's Add to shopping list and favorites features, the developer view, a mocked Gamepad API driving the real poller, teardown, reduced motion, and the minimal example loaded from `file://`.

**Not tested:** physical Fire TV, Android TV or other TV hardware, and real gamepads. Remote keys were exercised as synthesized `keydown` events in Chromium, and gamepad behaviour only with mocked Gamepad API objects. No performance or "button press reduction" figures are claimed.

## Scope limits

DPadBridge does not convert canvas/WebGL games, does not affect other apps or system UI, does not remap OS-level keys (including the voice/microphone button), and cannot focus elements that are not in the DOM (virtualized lists need `refresh()` after loading). Key codes vary by platform and are configurable via `keymap`.
