// Only covers what is decided before the database is touched, so no MySQL needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

let server, base;
test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(() => server.close());

const post = (path, body, headers = {}) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('device route without a key is 401', async () => {
  const res = await post('/device/detections', { item: 'Soda can' });
  assert.equal(res.status, 401);
});

test('bad summary query is 400 with details', async () => {
  const res = await fetch(base + '/summary?days=0');
  assert.equal(res.status, 400);
  assert.ok((await res.json()).details.length > 0);
});

test('refill without admin token is 401', async () => {
  assert.equal((await post('/devices/1/refill', { grams: 100 })).status, 401);
});

test('unknown route is 404 json', async () => {
  const res = await fetch(base + '/nope');
  assert.equal(res.status, 404);
});

test('malformed json is 400 not 500', async () => {
  const res = await fetch(base + '/device/detections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
  assert.equal(res.status, 400);
});
