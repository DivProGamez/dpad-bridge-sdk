// The whole DPadBridge integration for the Saffron Kitchen app, behind a toggle.
// The app's markup and handlers (app.js) are the same in both modes.
(function () {
  'use strict';

  var bridge = null;
  var toggle = document.getElementById('dpad-toggle');
  var logEl = document.getElementById('log');
  var events = document.getElementById('event-list');

  var HINTS_ON =
    '<span class="key keys4">' + arrow('r270') + arrow('') + arrow('r90') + arrow('r180') + '</span> Move' +
    '<span class="sep"></span><span class="key">Enter</span> OK' +
    '<span class="sep"></span><span class="key">Esc</span> Back' +
    '<span class="sep"></span><span class="key" title="Gamepad: D-pad moves, A = OK, B = Back"><svg class="ic" aria-hidden="true"><use href="#i-gamepad"/></svg></span>';
  var HINTS_OFF = 'Arrow keys do nothing yet: recipe cards are plain &lt;div&gt;s with click handlers.';

  function arrow(rot) {
    return '<svg class="ic" aria-hidden="true"><use href="#i-arrow"/></svg>'.replace('<svg', rot ? '<svg data-r="' + rot + '"' : '<svg');
  }

  function enable() {
    if (bridge) return;
    bridge = DPadBridge.createDPadBridge({
      root: document.getElementById('stage'), // app + its dialog
      observe: true, // filter chips and search add/remove cards: refresh automatically
      onMove: function (e) { log('Focused: ' + label(e.to) + ' · moved ' + e.direction); },
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
    log('DPadBridge mounted: focused ' + label(bridge.getFocused()));
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
    document.getElementById('mode-icon').setAttribute('href', on ? '#i-remote' : '#i-mouse');
    document.getElementById('mode-title').textContent = on ? 'AFTER · DPadBridge ON' : 'BEFORE · DPadBridge OFF';
    document.getElementById('mode-text').textContent = on
      ? 'Remote navigation enabled — DPadBridge mounted'
      : 'Mouse only — DPadBridge not mounted';
    document.getElementById('event-state').textContent = on ? '(listening)' : '(not mounted)';
    var hints = document.getElementById('hints');
    hints.innerHTML = on ? HINTS_ON : HINTS_OFF;
    Array.prototype.forEach.call(hints.querySelectorAll('svg[data-r]'), function (svg) {
      svg.classList.add(svg.getAttribute('data-r'));
    });
  }

  function label(el) {
    if (!el) return 'nothing';
    var t = el.querySelector && el.querySelector('.card-title, .name');
    var text = (t ? t.textContent : el.getAttribute('aria-label') || el.textContent || el.placeholder || el.id || el.tagName).trim();
    if (!t && el.closest && el.closest('label')) text = el.closest('label').textContent.trim();
    return '“' + text.replace(/\s+/g, ' ').slice(0, 28) + '”';
  }

  function log(msg) {
    logEl.textContent = msg;
    var li = document.createElement('li');
    li.textContent = msg;
    events.insertBefore(li, events.firstChild);
    while (events.children.length > 6) events.removeChild(events.lastChild);
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

  render(false);
  // Separate routes for each mode: ?dpad=on starts with the SDK mounted.
  if (/[?&]dpad=on\b/.test(location.search)) enable();

  // Exposed for the automated browser tests.
  window.__demo = { enable: enable, disable: disable, get bridge() { return bridge; } };
})();
