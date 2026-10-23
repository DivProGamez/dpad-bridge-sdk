// The whole DPadBridge integration for the Saffron Kitchen app, behind a toggle.
// The app's markup and handlers (app.js) are the same in both modes.
(function () {
  'use strict';

  var bridge = null;
  var toggle = document.getElementById('dpad-toggle');
  var logEl = document.getElementById('log');

  function enable() {
    if (bridge) return;
    bridge = DPadBridge.createDPadBridge({
      root: document.getElementById('stage'), // app + its dialog
      observe: true, // filter chips and search add/remove cards: refresh automatically
      onMove: function (e) { log('Move ' + e.direction + ' → ' + label(e.to)); },
      onActivate: function (e) { log('OK → ' + label(e.element) + ' (' + e.source + ')'); },
      onModalOpen: function () { log('Dialog opened: focus moved inside'); },
      onModalClose: function (e) { log('Dialog closed: focus restored to ' + label(e.restoredTo)); },
      onBoundary: function (e) { log('Edge reached (' + e.direction + '): focus kept on ' + label(e.element)); },
      onBack: function (ctx) {
        if (!ctx.modal) log('Back at top level: left to the platform (not trapped)');
        return false; // default: Back closes the open dialog, otherwise falls through
      },
    }).mount();
    render(true);
    log('DPadBridge mounted');
  }

  function disable() {
    if (!bridge) return;
    bridge.destroy();
    bridge = null;
    render(false);
    log('DPadBridge destroyed: listeners, focus ring and added attributes removed');
  }

  function render(on) {
    toggle.setAttribute('aria-checked', String(on));
    document.getElementById('toggle-state').textContent = on ? 'ON' : 'OFF';
    document.body.classList.toggle('dpad-on', on);
    document.getElementById('mode-badge').textContent = on ? 'AFTER · DPadBridge on' : 'BEFORE · mouse-first original';
    document.getElementById('hints').innerHTML = on
      ? '<kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> move · <kbd>Enter</kbd>/OK select · <kbd>Esc</kbd>/Back close · Gamepad: D-pad, A, B'
      : 'Arrow keys do nothing yet. The recipe cards are plain &lt;div&gt;s with click handlers: no keyboard or remote access.';
  }

  function label(el) {
    if (!el) return 'nothing';
    var t = el.querySelector && el.querySelector('.card-title');
    var text = (t ? t.textContent : el.getAttribute('aria-label') || el.textContent || el.placeholder || el.id || el.tagName).trim();
    return '“' + text.replace(/\s+/g, ' ').slice(0, 28) + '”';
  }

  function log(msg) {
    logEl.textContent = msg;
  }

  toggle.addEventListener('click', function () { (bridge ? disable : enable)(); });

  // "d" toggles too (handy when recording), but never while typing.
  window.addEventListener('keydown', function (e) {
    var t = e.target;
    var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'd' || e.key === 'D')) {
      (bridge ? disable : enable)();
    }
  });

  // Separate routes for each mode: ?dpad=on starts with the SDK mounted.
  if (/[?&]dpad=on\b/.test(location.search)) enable();

  // Exposed for the automated browser tests.
  window.__demo = { enable: enable, disable: disable, get bridge() { return bridge; } };
})();
