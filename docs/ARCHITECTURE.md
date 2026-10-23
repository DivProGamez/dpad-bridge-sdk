# DPadBridge architecture

DPadBridge is split into four small, separately tested modules and a single stateful coordinator.

```
src/geometry.js  pure: rectangles in, best candidate out (no DOM)
src/targets.js   which elements are navigable; who owns an arrow key inside a field
src/input.js     key normalisation, gamepad normalisation, gamepad poller
src/scroll.js    reveal an element inside nested scroll containers
src/bridge.js    createDPadBridge(): state, listeners, modals, events, lifecycle
```

The coordinator uses `root.ownerDocument.defaultView` for every browser API. It never touches globals, so the same code runs in a browser, in a TV web runtime and in jsdom tests.

## 1. Target discovery

`collectTargets(root, selectors)` runs one `querySelectorAll` with the default selector list (buttons, `a[href]`, form controls, `summary`, `[tabindex]` except `-1`, contenteditable, `[data-dpad-focusable]`). It then keeps only elements that pass `isUsableTarget`:

1. connected, not `data-dpad-focusable="false"`, not inside `[data-dpad-ignore]`
2. not disabled: `:disabled`, `aria-disabled="true"`, or inside `fieldset[disabled]` (except its first `<legend>`)
3. not inside `[inert]`, `[hidden]` or `[aria-hidden="true"]`
4. rendered: `checkVisibility()` where available, otherwise a `display`/`visibility` walk, plus a non-zero bounding box

Targets are cached by `refresh()`, which keeps DOM order for deterministic tie-breaks. Visibility is checked again on every move, so an element hidden or disabled after the last refresh is skipped right away. Non-native `data-dpad-focusable` elements without a `tabindex` get `tabindex="0"`, which is recorded and removed by `destroy()`. They can then take real DOM focus and stay in the Tab order.

## 2. Directional scoring

For a source rect **S**, a candidate rect **C** and a direction:

1. **Direction filter (strict).** `primaryGap = distance from S's leading edge to C's near edge` must be at least `-1px`. Only candidates genuinely beyond the edge qualify.
2. **Overlap fallback.** If nothing passes, accept candidates whose centre *and* far edge moved in the direction. This keeps overlapping layouts, such as a badge on a card, reachable.
3. **Score** (lower wins):

   ```
   score = primaryGap
         + 4    × orthoGap        // perpendicular gap; 0 when C is inside S's "beam"
         + 0.25 × centerOffset    // perpendicular distance between centres
         − 20   × overlapRatio    // 0..1 share of the smaller box inside the beam
   ```

   Aligned targets win easily. A slightly offset target that is much closer still beats an aligned one far away, so the UI never feels stuck.
4. **Tie-break chain** (scores within 0.5px): smaller `primaryGap`, then smaller `centerOffset`, then DOM order. The same input always gives the same answer, and the tests check this.

### Groups (panels)

Elements inside a `data-dpad-group` container are scored in two passes:

1. **Same group first.** If any candidate in the source's group lies in that direction, the best of those wins.
2. **Leaving the group** is allowed only to candidates whose perpendicular projection overlaps the source (`perpendicularOverlap > 0`). Focus therefore never hops diagonally from the corner of a card grid into an unrelated side panel. If no such target exists, the move is a boundary: focus stays and a `boundary` event fires.
3. **Group memory.** When focus enters another group, the item last focused there is restored, if it is still usable. This is the usual "return to where I was in that row" TV behaviour.

Explicit `data-dpad-<direction>="#selector"` overrides run before scoring. `"none"` blocks a direction.

## 3. Event flow

```
keydown (window, bubble phase)
  ├─ skip if defaultPrevented (the app handled it), alt/ctrl/meta, or IME composing
  ├─ normalizeKey(): ArrowX / legacy codes / Enter / Escape, GoBack, 461, 10009...
  │    unknown keys (media, voice, letters) → return untouched
  ├─ direction → arrowOwnership(activeElement) says 'native' (caret, slider) → return
  │             keyboard auto-repeat throttled to repeatInterval
  │             move(dir) → preventDefault (no page scroll)
  ├─ ok        → text field? return (Enter submits / new line natively)
  │             preventDefault, ignore repeat, activate() → element.click() once
  └─ back      → Backspace inside a text field? return (it's deleting text)
                back(): onBack/on('back') handler → modal close → otherwise NOT prevented

gamepad poller (rAF, only while a pad is connected)
  normalizeGamepad() per pad → OR → edge detection → move/activate/back
  held directions repeat after repeatDelay every repeatInterval; OK/Back never repeat

focusin (document)
  ├─ our own element.focus() calls are ignored (internal flag)
  ├─ focus escaped the open modal → pulled back inside (intentional containment)
  └─ Tab / mouse focused another target → adopted (class follows real focus)
```

**Activation exactly once.** On OK, the SDK calls `preventDefault()` on the `keydown`, which cancels the browser's own Enter activation, and then calls `element.click()` once. `click()` runs the element's native activation behaviour: links navigate, submit buttons submit, checkboxes toggle, `<summary>` toggles, and `<div onclick>` handlers fire. Repeated `keydown` (held key) is ignored. A 150ms per-element guard (`activationGuard`) absorbs a keyboard and a gamepad press arriving together. A `<select>` opens via `showPicker()` when available. Text fields are focused, never clicked.

## 4. Modals and focus restoration

`syncModals()` runs on every key action, on `refresh()`, on observer batches, on the captured `close` event of `<dialog>`, and right after each activation (immediately and on the next frame). It compares the open modals (`modalSelector`, visible) with a stack:

- **Opened:** push `{ modal, returnFocus, returnRect }`. `returnFocus` is the most recent entry in a 20-item focus history that is outside the modal. This copes with `dialog.showModal()` having already moved focus inside before the SDK noticed. Targets are re-collected, because the modal's content was hidden at the last refresh. Focus moves to `[data-dpad-autofocus]`, `[data-dpad-initial]` or `[autofocus]`, else the first target in the modal, unless focus is already inside.
- **While open:** navigation candidates come only from the top modal, and the `focusin` guard pulls escaped focus back. This is the only focus trap, and it is intentional.
- **Closed:** pop. If focus is still inside the closed modal, or invalid, restore it in this order: `data-dpad-restore` selector, the recorded opener, the target nearest the opener's last rectangle, then the first target. If the app already moved focus somewhere valid itself, that choice is respected.

**Back with a modal open:** the `onBack` handler gets `ctx.modal` and `ctx.closeModal()`. Without a handler, the SDK clicks the modal's `[data-dpad-close]` button, or calls `dialog.close()`, or dispatches a `dpad:close` event for custom modals. **Back without a modal** that nobody handles is not prevented, so the platform's default Back behaviour still works.

## 5. Focus loss prevention

After each focus, the SDK stores the element's rectangle. If the focused element is removed, hidden or disabled, the next `refresh()` or key press calls `relocate()`, which focuses the target nearest that last rectangle (`nearestCandidate`). Focus never silently falls back to `<body>` while targets exist.

## 6. Scrolling

`revealElement(el)` walks the scrollable ancestors from the innermost out to `document.scrollingElement`. For each one, it computes the smallest delta that brings the element inside the visible box with `scrollMargin` (or centres it in `center` mode) and clamps it to the scroll range. Smooth scrolling has not moved anything yet when the outer containers are measured, so the element's *future* position is tracked analytically and outer containers are not over-scrolled. The behaviour is `smooth`, or `auto` (instant) when `prefers-reduced-motion: reduce` matches.

## 7. MutationObserver mode

With `observe: true`, the root is observed for child-list changes and a filtered set of attributes (`class`, `style`, `hidden`, `disabled`, `inert`, `open`, `aria-*`, `data-dpad-*`, …). Records are batched into one `refresh()` per microtask. The SDK's own writes are filtered out so it cannot loop: a `class` change that only toggles the focus class, and `tabindex` on elements it added. A unit test checks both the filtering and that real app mutations still refresh.

## 8. Lifecycle and cleanup

Every `addEventListener` goes through one `listen()` helper that records a disposer. `destroy()` runs all disposers: window `keydown`, the gamepad connect/disconnect listeners and frame loop, document `focusin` and capture `close`, and the observer. It also cancels pending animation frames, releases the reference-counted `<style>` (shared by bridges in the same document), removes the focus class, `tabindex` attributes and `data-dpad-bridge` root marker, and clears all state. Unit tests spy on `add/removeEventListener` and assert that zero listeners remain.
