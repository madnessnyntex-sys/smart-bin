const test = require('node:test');
const assert = require('node:assert/strict');
const { decideAction, ACTIONS } = require('../src/rewards');

test('recyclable item with enough rice dispenses', () => {
  const r = decideAction({ recyclable: true, rewardGrams: 20, stockGrams: 100 });
  assert.deepEqual(r, { action: ACTIONS.DISPENSE, riceGrams: 20 });
});

test('non-recyclable item is rejected', () => {
  const r = decideAction({ recyclable: false, rewardGrams: 0, stockGrams: 100 });
  assert.equal(r.action, ACTIONS.REJECT);
  assert.equal(r.riceGrams, 0);
});

test('not enough rice left reports out of stock', () => {
  const r = decideAction({ recyclable: true, rewardGrams: 25, stockGrams: 10 });
  assert.equal(r.action, ACTIONS.OUT_OF_STOCK);
  assert.equal(r.riceGrams, 0);
});

test('exactly enough rice still dispenses', () => {
  assert.equal(decideAction({ recyclable: true, rewardGrams: 25, stockGrams: 25 }).action, ACTIONS.DISPENSE);
});
