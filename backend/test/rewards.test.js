const test = require('node:test');
const assert = require('node:assert/strict');
const { decideAction, giveBackRice, correctDetection, ACTIONS } = require('../src/rewards');

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

// ---- deleting / editing a wrong detection ----

test('giving rice back adds it to the stock', () => {
  assert.equal(giveBackRice({ stockGrams: 100, capacityGrams: 5000, riceGrams: 25 }), 125);
});

test('giving rice back never goes above the hopper capacity', () => {
  assert.equal(giveBackRice({ stockGrams: 4990, capacityGrams: 5000, riceGrams: 25 }), 5000);
});

test('giving back 0g (a rejected item) changes nothing', () => {
  assert.equal(giveBackRice({ stockGrams: 100, capacityGrams: 5000, riceGrams: 0 }), 100);
});

const fix = (over) => correctDetection({
  oldRiceGrams: 0, recyclable: true, rewardGrams: 25, stockGrams: 1000, capacityGrams: 5000, ...over,
});

test('editing a rejected item into a recyclable one takes rice out', () => {
  const r = fix({ oldRiceGrams: 0, rewardGrams: 25, stockGrams: 1000 });
  assert.deepEqual(r, { action: ACTIONS.DISPENSE, riceGrams: 25, stockGrams: 975 });
});

test('editing a dispensed item into a non-recyclable one gives the rice back', () => {
  const r = fix({ oldRiceGrams: 25, recyclable: false, rewardGrams: 0, stockGrams: 975 });
  assert.deepEqual(r, { action: ACTIONS.REJECT, riceGrams: 0, stockGrams: 1000 });
});

test('editing between two recyclable items only moves the difference', () => {
  // was a 25g can, really a 10g cardboard: 25 back, 10 out
  const r = fix({ oldRiceGrams: 25, rewardGrams: 10, stockGrams: 975 });
  assert.deepEqual(r, { action: ACTIONS.DISPENSE, riceGrams: 10, stockGrams: 990 });
});

test('editing into a recyclable item when the hopper is nearly empty reports out of stock', () => {
  const r = fix({ oldRiceGrams: 0, rewardGrams: 25, stockGrams: 10 });
  assert.deepEqual(r, { action: ACTIONS.OUT_OF_STOCK, riceGrams: 0, stockGrams: 10 });
});

test('the rice from the old record counts as available when judging the new item', () => {
  // only 5g left, but this record used 25g, so a 25g item fits again
  const r = fix({ oldRiceGrams: 25, rewardGrams: 25, stockGrams: 5 });
  assert.deepEqual(r, { action: ACTIONS.DISPENSE, riceGrams: 25, stockGrams: 5 });
});

test('stock never goes negative or above capacity after an edit', () => {
  for (const stockGrams of [0, 5, 4990, 5000]) {
    for (const oldRiceGrams of [0, 25]) {
      for (const rewardGrams of [0, 10, 25]) {
        const r = fix({ stockGrams, oldRiceGrams, rewardGrams, recyclable: rewardGrams > 0 });
        assert.ok(r.stockGrams >= 0 && r.stockGrams <= 5000, JSON.stringify({ stockGrams, oldRiceGrams, rewardGrams, r }));
      }
    }
  }
});
