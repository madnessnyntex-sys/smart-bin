const test = require('node:test');
const assert = require('node:assert/strict');
const { detectionBody, rangeQuery, refillBody } = require('../src/schemas');

test('detection body accepts a normal payload', () => {
  assert.equal(detectionBody.parse({ item: ' Water bottle ', confidence: 0.9 }).item, 'Water bottle');
});

test('detection body rejects bad confidence and empty item', () => {
  assert.equal(detectionBody.safeParse({ item: 'x', confidence: 1.5 }).success, false);
  assert.equal(detectionBody.safeParse({ item: '   ' }).success, false);
});

test('range query defaults to 7 days and coerces strings', () => {
  assert.equal(rangeQuery.parse({}).days, 7);
  assert.equal(rangeQuery.parse({ days: '30' }).days, 30);
  assert.equal(rangeQuery.safeParse({ days: '0' }).success, false);
});

test('refill must be a positive whole number', () => {
  assert.equal(refillBody.safeParse({ grams: -5 }).success, false);
  assert.equal(refillBody.safeParse({ grams: 1.5 }).success, false);
});
