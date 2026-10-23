import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers/dom.js';
import { collectTargets, arrowOwnership, isTextEntry } from '../src/targets.js';

const box = (i) => `data-rect="${i * 110},0,100,40"`;

describe('collectTargets', () => {
  test('includes native controls and explicit data-dpad-focusable nodes', () => {
    const { document } = setup(`
      <button id="btn" ${box(0)}>b</button>
      <a id="link" href="#x" ${box(1)}>a</a>
      <input id="text" ${box(2)}>
      <select id="sel" ${box(3)}><option>1</option></select>
      <textarea id="ta" ${box(4)}></textarea>
      <div id="card" data-dpad-focusable ${box(5)}>card</div>
      <div id="tab" tabindex="0" ${box(6)}>tab</div>
      <details><summary id="sum" ${box(7)}>s</summary></details>
    `);
    assert.deepEqual(
      collectTargets(document.body).map((el) => el.id),
      ['btn', 'link', 'text', 'sel', 'ta', 'card', 'tab', 'sum'],
    );
  });

  test('excludes disabled, hidden, inert, invisible and non-interactive elements', () => {
    const { document } = setup(`
      <button id="ok" ${box(0)}>ok</button>
      <button id="disabled" disabled ${box(1)}>x</button>
      <button id="ariaDisabled" aria-disabled="true" ${box(2)}>x</button>
      <fieldset disabled><button id="inFieldset" ${box(3)}>x</button></fieldset>
      <div hidden><button id="hiddenParent" ${box(4)}>x</button></div>
      <button id="displayNone" style="display:none" ${box(5)}>x</button>
      <div style="display:none"><button id="displayNoneParent" ${box(6)}>x</button></div>
      <button id="visHidden" style="visibility:hidden" ${box(7)}>x</button>
      <div inert><button id="inert" ${box(8)}>x</button></div>
      <div aria-hidden="true"><button id="ariaHidden" ${box(9)}>x</button></div>
      <button id="zeroSize" data-rect="0,0,0,0">x</button>
      <a id="noHref" ${box(10)}>plain anchor</a>
      <div id="plainDiv" ${box(11)}>text</div>
      <input type="hidden" id="hiddenInput" ${box(12)}>
      <div id="minusOne" tabindex="-1" ${box(13)}>x</div>
      <button id="optOut" data-dpad-focusable="false" ${box(14)}>x</button>
      <div data-dpad-ignore><button id="ignored" ${box(15)}>x</button></div>
    `);
    assert.deepEqual(collectTargets(document.body).map((el) => el.id), ['ok']);
  });

  test('a control inside the first legend of a disabled fieldset stays usable', () => {
    const { document } = setup(`
      <fieldset disabled>
        <legend><button id="legendBtn" ${box(0)}>l</button></legend>
        <button id="inner" ${box(1)}>x</button>
      </fieldset>`);
    assert.deepEqual(collectTargets(document.body).map((el) => el.id), ['legendBtn']);
  });

  test('custom selectors replace the defaults', () => {
    const { document } = setup(`<button id="b" ${box(0)}>b</button><li id="li" class="row" ${box(1)}>row</li>`);
    assert.deepEqual(collectTargets(document.body, ['.row']).map((el) => el.id), ['li']);
  });
});

describe('arrowOwnership: typing is never hijacked', () => {
  const { document } = setup(`
    <input id="text" value="hello">
    <input id="email" type="email" value="a@b.c">
    <textarea id="ta">line1\nline2</textarea>
    <input id="num" type="number" value="3">
    <input id="range" type="range">
    <div id="ce" contenteditable="true">edit</div>
    <div data-dpad-passthrough><button id="widget">w</button></div>
    <button id="btn">b</button>`);
  const $ = (id) => document.getElementById(id);

  test('text input: Up/Down navigate; Left/Right only at the caret edges', () => {
    const el = $('text');
    assert.equal(arrowOwnership(el, 'up'), 'sdk');
    assert.equal(arrowOwnership(el, 'down'), 'sdk');
    el.setSelectionRange(2, 2);
    assert.equal(arrowOwnership(el, 'left'), 'native');
    assert.equal(arrowOwnership(el, 'right'), 'native');
    el.setSelectionRange(0, 0);
    assert.equal(arrowOwnership(el, 'left'), 'sdk');
    el.setSelectionRange(5, 5);
    assert.equal(arrowOwnership(el, 'right'), 'sdk');
    el.setSelectionRange(0, 5);
    assert.equal(arrowOwnership(el, 'left'), 'native', 'a selection is being edited');
  });

  test('textarea keeps arrows unless the caret is at the very start or end', () => {
    const el = $('ta');
    el.setSelectionRange(3, 3);
    for (const d of ['up', 'down', 'left', 'right']) assert.equal(arrowOwnership(el, d), 'native');
    el.setSelectionRange(0, 0);
    assert.equal(arrowOwnership(el, 'up'), 'sdk');
    el.setSelectionRange(el.value.length, el.value.length);
    assert.equal(arrowOwnership(el, 'down'), 'sdk');
  });

  test('number, range, contenteditable, passthrough and buttons', () => {
    assert.equal(arrowOwnership($('num'), 'up'), 'native');
    assert.equal(arrowOwnership($('num'), 'right'), 'sdk');
    assert.equal(arrowOwnership($('range'), 'left'), 'native');
    assert.equal(arrowOwnership($('range'), 'down'), 'sdk');
    assert.equal(arrowOwnership($('ce'), 'left'), 'native');
    assert.equal(arrowOwnership($('ce'), 'down'), 'sdk');
    assert.equal(arrowOwnership($('widget'), 'down'), 'native');
    assert.equal(arrowOwnership($('btn'), 'left'), 'sdk');
  });

  test('isTextEntry distinguishes typing fields from buttons', () => {
    assert.equal(isTextEntry($('text')), true);
    assert.equal(isTextEntry($('ta')), true);
    assert.equal(isTextEntry($('ce')), true);
    assert.equal(isTextEntry($('btn')), false);
    assert.equal(isTextEntry($('range')), false);
  });
});
