// Only covers what is decided before the database is touched, so no MySQL needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { signToken } = require('../src/auth');

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

// a valid login token, so the dashboard routes let the test in
const loggedIn = { Authorization: `Bearer ${signToken({ id: 1, email: 'test@example.com' })}` };

test('bad summary query is 400 with details', async () => {
  const res = await fetch(base + '/summary?days=0', { headers: loggedIn });
  assert.equal(res.status, 400);
  assert.ok((await res.json()).details.length > 0);
});

test('dashboard routes need a login', async () => {
  for (const path of ['/summary', '/devices', '/detections/recent', '/waste-types', '/auth/me']) {
    assert.equal((await fetch(base + path)).status, 401, `GET ${path}`);
  }
  assert.equal((await post('/dev/simulate', { item: 'Soda can' })).status, 401);
});

const patch = (path, body, headers = {}) =>
  fetch(base + path, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const del = (path, headers = {}) => fetch(base + path, { method: 'DELETE', headers });

test('editing or deleting a detection needs a login', async () => {
  assert.equal((await patch('/detections/1', { item: 'Soda can' })).status, 401);
  assert.equal((await del('/detections/1')).status, 401);
});

test('edit and delete refuse a bad id or body before touching the database', async () => {
  assert.equal((await patch('/detections/abc', { item: 'Soda can' }, loggedIn)).status, 400);
  assert.equal((await patch('/detections/1', { item: '' }, loggedIn)).status, 400);
  assert.equal((await del('/detections/0', loggedIn)).status, 400);
  assert.equal((await del('/detections/-4', loggedIn)).status, 400);
});

test('a forged or garbage token is refused', async () => {
  const bad = { Authorization: 'Bearer not.a.token' };
  assert.equal((await fetch(base + '/summary', { headers: bad })).status, 401);
});

test('/auth/me returns the logged-in email without touching the database', async () => {
  const res = await fetch(base + '/auth/me', { headers: loggedIn });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).email, 'test@example.com');
});

test('register is refused without the right invite code', async () => {
  const res = await post('/auth/register', { email: 'a@b.co', password: 'longenough1', inviteCode: 'definitely-wrong' });
  assert.equal(res.status, 403);
});

test('register and login reject bad input with 400', async () => {
  assert.equal((await post('/auth/register', { email: 'not-an-email', password: 'short', inviteCode: 'x' })).status, 400);
  assert.equal((await post('/auth/login', { email: 'a@b.co' })).status, 400);
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
