# DPADBRIDGE SDK — COMPLETE CLAUDE CODE CLOUD TASK

## Mission and deadline

Build and publish a genuine, independent, MIT-licensed open-source developer tool for the **Open Source Mini Challenge** of the **Amazon Developer Hackathon 2026**. The submission deadline is **October 23, 2026 at 12:00 PM PDT (19:00 Morocco time)**. Complete a working, tested, publicly accessible contribution before the deadline; do not spend time writing plans instead of code.

This is an **additional open-source contribution**, not a third Primary Track submission. It must be separate and materially different from the two already submitted primary-track projects.

## Important existing context — do not repeat work

The entrant is an independent developer using GitHub username **DivProGamez**. Two primary projects are already submitted on Devpost:

- **PlanB Orchestra** — Alexa+ simulated household planning / replanning, repository `https://github.com/DivProGamez/planb-orchestra`, updated Phase 2 narrated demo `https://youtu.be/5cm49jP8_sw`.
- **PressPath TV** — Fire TV track, a family TV app that measures and adapts its own D-pad navigation, repository `https://github.com/DivProGamez/presspath-tv`, narrated demo `https://youtu.be/bzkkslQzQPY`.

Do not edit either project, their Devpost submissions, videos, releases, Git branches, APKs, or existing files. Do not merely extract / copy their code into a new repository. Their existence is background context only.

## Your ONLY repository and product

The selected and authorized cloud repository is:

`https://github.com/DivProGamez/dpad-bridge-sdk`

It may initially contain only README and MIT LICENSE. Work only in this repository's cloned cloud workspace, on a new feature branch/PR. You are not authorized to scan the user's computer or access other local repos or personal files. Standard dependency downloads allowed as needed. Never commit secrets.

**Product:** DPadBridge SDK — Make ordinary DOM-based web interfaces navigable with a TV remote and gamepad, without rebuilding their UI from scratch.

**Value:** many simple HTML5 apps are mouse-first. DPadBridge adds an accessible, predictable focus graph and input adapter to ordinary focusable DOM elements, with clearly visible focus, Back semantics, focus-aware scrolling and modal focus management. This is a developer SDK; it DOES NOT magically convert canvas/WebGL games, work across third-party apps, or modify Fire TV OS controls.

## Genuine core features to IMPLEMENT (not merely describe)

### 1. Reusable library

- Plain JavaScript, offline runtime, no framework required.
- Entry point such as `createDPadBridge({root, selectors, ...})`; implement `.mount()`, `.refresh()`, `.destroy()`, `.focus(element)` and useful small API if needed.
- Locate visible/enabled interactive DOM targets: buttons, links, form controls, explicit `data-dpad-focusable` nodes. Ignore disabled, hidden, inert and non-interactive targets.
- Spatial Up/Down/Left/Right navigation using actual DOM element rectangles; deterministic candidate scoring, direction filtering and tie-breaks. Avoid jumping diagonally across unrelated panels where closer directional targets exist.
- Active focus indicated by a CSS class / focus-visible decoration. Only one active focus node, not just a fake glowing overlay.
- OK / Enter activates elements using native semantics while preventing duplicate activations; Escape / Back supports documented callbacks and dialog closing. Do not hijack the OS Alexa/microphone button.
- Focus restoration when returning from modal/screens where application markup supports it.
- Automatically scroll focused offscreen elements into view and support long lists without mouse use.
- Handle DOM updates via explicit `.refresh()` or an optional safe MutationObserver, without leaking listeners.
- Handle keyboard and supported gamepad input via the Gamepad API where available; gracefully degrade if gamepad is absent. Use proper key repeat / debouncing and avoid double activation.
- Accessibility: honor `prefers-reduced-motion`, visible high-contrast focus theme, retain meaningful keyboard tab semantics where possible, no focus traps except intentional modal containment.
- Clean unsubscribe/destroy API; no global event listeners after destroy.

### 2. Truly demonstrable BEFORE / AFTER

Create an original small **mouse-first HTML5 sample interface** with several cards, menu, modal and scrollable list. Show the exact same original controls before integration and after enabling DPadBridge. Enable/disable the SDK with a real UI toggle or separate demo routes. Demonstrate D-pad arrow movement, OK activation, Back, scrolling and modal return. Use on-screen hints and a visible focused card. Do NOT present fabricated quantitative press-reduction claims; the SDK is about adding navigation capability, not measuring the PressPath product.

### 3. Documentation and developer onboarding

Deliver:
- `README.md` with the problem, supported scope, accurate capabilities, installation, 5-line quick start, API reference, usage demo, screenshots if genuine, limitations, browser support and how to run tests.
- MIT `LICENSE` at the repository root, detectable by GitHub.
- `examples/` with working offline demos (not dead screenshots).
- `docs/ARCHITECTURE.md` with directional scoring, event flow, and focus restoration design.
- `docs/CONTRIBUTING.md` with tests, coding conventions and a simple example for external contributors.
- `docs/HACKATHON_CONTRIBUTION.md` with what is genuinely new, how it works, why it matters for TV developers and what was actually tested.
- `package.json` scripts `npm test`, `npm run demo` and, if browser tests are included, `npm run test:e2e`.
- A secure `.gitignore` and no key files or platform credentials.

### 4. Real tests

Write and RUN focused tests that verify:
- Directional focus selection for grid, row, column, uneven layouts and ties.
- Invisible/disabled element exclusion.
- Boundary behavior and no focus loss.
- Dynamic nodes and `.refresh()`.
- Native activation only once, Back callback.
- Modal focus trap/restoration behavior if implemented.
- Scroll reveal of newly focused element.
- Listener cleanup after destroy.
- Input adapters do not interfere with typing into text inputs.
- Gamepad normalization where a mock is sufficient (state explicitly whether real hardware was tested).
- Browser end-to-end flows for an original demo when headless browser available; use Playwright or comparable tooling if supported. Do not claim browser coverage unless it actually ran.

No fake passing tests, no invented performance numbers. If a feature fails, fix it or reduce the stated scope honestly.

### 5. Strong, competition-quality contribution

This must be more than a README or a renamed copy of the submitted PressPath code. Implement substantial original library code, meaningful edge-case tests, functioning demo, and clear developer value. Avoid unnecessary dependencies and overengineering.

Use a clean visual demo with dark TV-friendly 16:9 layout, bright focus outline, legible text. Design quality matters, but do not divert into designing 16 Stitch screens or building an APK. A reusable library is the deliverable.

## GitHub and publishing requirements

- Work in the connected **dpad-bridge-sdk** repository, not either primary project.
- Before editing, confirm repository root, status, permissions, and whether new commits can be pushed.
- Make a real commit with a clear message, push it to a public branch, and create a PR against `main` if supported. Public GitHub contribution evidence must exist **before the deadline**.
- A PR need not be merged to satisfy the published Open Source challenge requirements, but merging a reviewed, passing PR to `main` makes the project simpler to evaluate. Do not claim a merge without verification. If merging needs user action, surface the exact PR link and steps.
- Ensure `https://github.com/DivProGamez/dpad-bridge-sdk` shows the MIT license, code, README and install/test instructions on the default branch when possible.
- Save actual commit and PR URLs. Never invent links or claim repository publication if push failed.

## Exact competition metadata to deliver

The existing PressPath TV primary-track submission may have an Open Source Mini Challenge = Yes selection that currently references PlanB Orchestra. Do NOT assume PlanB is eligible as the additional contribution. The new standalone DPadBridge SDK is intended as the separate contribution. Do not edit Devpost yourself unless a real authenticated Devpost integration is explicitly available and authorized; cloud GitHub credentials do not grant Devpost access.

At the end, provide four READY-TO-PASTE Devpost fields (grounded in actual published links and working code):

1. **Contribution URL** — precise public commit / PR / branch URL for DPadBridge.
2. **Project repository URL** — `https://github.com/DivProGamez/dpad-bridge-sdk` (only if live).
3. **GitHub username** — `DivProGamez`.
4. **Description (what, how, why)** — compelling factual English paragraph describing substantive original functionality and actual tests; no claims about Fire OS device testing, gamepad hardware or browser E2E without evidence.

Explain to the user where to edit **the existing PressPath TV Devpost Additional Info → Open Source Mini Challenge fields**, replacing any previous PlanB contribution links, and save/verify `SUBMITTED`. Do not create a third primary-track Devpost project or change either primary track. Do not assert mini-challenge eligibility is guaranteed; the organizer judges eligibility.

## Time and execution

The user has an urgent October 23 19:00 Morocco deadline and is using a Claude Code Cloud session because their local Claude weekly allowance is exhausted. This is a real implementation assignment, not a request for a proposal or an asynchronous promise.

Prioritize in this order:
1. Working original SDK + example.
2. Automated unit tests and real verified commands.
3. README/LICENSE/hackathon contribution description.
4. Push branch and PR, preferably merge passing work.
5. Extra polish and E2E only if time permits.

If the browser tooling is unavailable, do not block publishing a proven useful library: document the limitation and supply manually reproducible steps. If a short partial scope is required, ship a correct small SDK rather than a fake complete one.

Final report MUST include:
- Public repository, commit and PR URLs (verified).
- Exact tests run and pass/fail counts.
- How to run demo and install package.
- Clear supported vs unsupported scope.
- Final four Devpost field values.
- Exact user-only remaining steps, including merging if needed and Devpost update.

**START IMPLEMENTING IMMEDIATELY. DO NOT SEARCH OTHER REPOSITORIES OR REWRITE EITHER SUBMITTED PROJECT.**
