// No hardware or network needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArduinoLine, actionToCommand, cleanClassification } = require('../protocol');
const { pickFromMenu, ITEMS } = require('../menu');

test('Arduino lines are recognised, with stray spaces and CRs ignored', () => {
  for (const word of ['READY', 'DETECT', 'DONE', 'TIMEOUT']) {
    assert.equal(parseArduinoLine(word).type, word);
    assert.equal(parseArduinoLine(`  ${word}\r`).type, word);
  }
  assert.equal(parseArduinoLine('DIST 12').type, 'DIST');
  assert.equal(parseArduinoLine('').type, 'EMPTY');
  assert.equal(parseArduinoLine('\r').type, 'EMPTY');
});

test('unknown or garbled lines are reported, not crashed on', () => {
  assert.deepEqual(parseArduinoLine('hello'), { type: 'UNKNOWN', text: 'hello' });
  assert.equal(parseArduinoLine('detect').type, 'UNKNOWN'); // case matters
  assert.equal(parseArduinoLine('DETECTX').type, 'UNKNOWN');
  assert.equal(parseArduinoLine('DIST abc').type, 'UNKNOWN');
});

test('backend actions become the lines the sketch expects', () => {
  assert.equal(actionToCommand({ action: 'DISPENSE', rice_grams: 20 }), 'DISPENSE,20');
  assert.equal(actionToCommand({ action: 'REJECT', rice_grams: 0 }), 'REJECT');
  assert.equal(actionToCommand({ action: 'OUT_OF_STOCK', rice_grams: 0 }), 'OUT_OF_STOCK');
});

test('anything odd becomes ERROR so no rice is given by accident', () => {
  assert.equal(actionToCommand(null), 'ERROR');
  assert.equal(actionToCommand('DISPENSE'), 'ERROR');
  assert.equal(actionToCommand({}), 'ERROR');
  assert.equal(actionToCommand({ action: 'SOMETHING_NEW' }), 'ERROR');
  assert.equal(actionToCommand({ action: 'DISPENSE' }), 'ERROR'); // no grams
  assert.equal(actionToCommand({ action: 'DISPENSE', rice_grams: 0 }), 'ERROR');
  assert.equal(actionToCommand({ action: 'DISPENSE', rice_grams: -5 }), 'ERROR');
  assert.equal(actionToCommand({ action: 'DISPENSE', rice_grams: 2.5 }), 'ERROR');
  assert.equal(actionToCommand({ action: 'DISPENSE', rice_grams: '20' }), 'ERROR');
});

test('classify() results: null means no camera yet, good answers are cleaned, bad ones throw', () => {
  assert.equal(cleanClassification(null), null);
  assert.equal(cleanClassification(undefined), null);
  assert.deepEqual(cleanClassification({ item: ' Soda can ', confidence: 0.9 }), { item: 'Soda can', confidence: 0.9 });
  assert.deepEqual(cleanClassification({ item: 'Soda can' }), { item: 'Soda can' });
  assert.throws(() => cleanClassification({ item: '   ' }));
  assert.throws(() => cleanClassification({}));
  assert.throws(() => cleanClassification({ item: 'x'.repeat(61) }));
  assert.throws(() => cleanClassification({ item: 'Soda can', confidence: 1.5 }));
  assert.throws(() => cleanClassification({ item: 'Soda can', confidence: '0.9' }));
});

test('menu numbers map to items, anything else is refused', () => {
  assert.equal(pickFromMenu('1'), ITEMS[0]);
  assert.equal(pickFromMenu(' 3 '), ITEMS[2]);
  assert.equal(pickFromMenu(String(ITEMS.length)), 'Unrecognized');
  for (const bad of ['0', String(ITEMS.length + 1), '-1', '1.5', 'abc', '', ' ']) {
    assert.equal(pickFromMenu(bad), null, `"${bad}"`);
  }
});

test('every menu item is a name the backend schema knows', () => {
  const schema = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../backend/schema.sql'), 'utf8');
  for (const name of ITEMS) assert.ok(schema.includes(`'${name}'`), `${name} is not in backend/schema.sql`);
});
