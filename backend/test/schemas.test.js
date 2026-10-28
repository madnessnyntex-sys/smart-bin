const test = require('node:test');
const assert = require('node:assert/strict');
const { detectionBody, rangeQuery, refillBody, updateDetectionBody, idParam } = require('../src/schemas');

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

test('editing a detection needs a non-empty item name', () => {
  assert.equal(updateDetectionBody.parse({ item: ' Soda can ' }).item, 'Soda can');
  assert.equal(updateDetectionBody.safeParse({ item: '  ' }).success, false);
  assert.equal(updateDetectionBody.safeParse({}).success, false);
});

test('id in the URL must be a whole number from 1 up', () => {
  assert.equal(idParam.parse('12'), 12);
  for (const bad of ['0', '-3', '1.5', 'abc', '']) {
    assert.equal(idParam.safeParse(bad).success, false, `"${bad}"`);
  }
});
