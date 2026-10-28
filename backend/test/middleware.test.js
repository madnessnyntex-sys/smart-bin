// The refill route accepts a dashboard login OR the admin token. Tested directly, no database.
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../src/config');
const { signToken } = require('../src/auth');
const { userOrAdminAuth } = require('../src/middleware');

// runs the middleware with a fake request and returns what it passed to next()
function run(authorization) {
  const req = { get: (name) => (name === 'authorization' ? authorization : undefined) };
  let result = 'next was never called';
  userOrAdminAuth(req, {}, (err) => { result = err; });
  return { req, err: result };
}

test.beforeEach(() => { config.adminToken = 'test-admin-token'; });

test('a logged-in user is let through', () => {
  const { req, err } = run(`Bearer ${signToken({ id: 3, email: 'me@example.com' })}`);
  assert.equal(err, undefined);
  assert.equal(req.user.email, 'me@example.com');
});

test('the admin token is still let through', () => {
  assert.equal(run('Bearer test-admin-token').err, undefined);
});

test('no token, a wrong token and a garbage login token are all 401', () => {
  for (const header of [undefined, '', 'Bearer wrong', 'Bearer not.a.token']) {
    assert.equal(run(header).err?.status, 401, `header: ${header}`);
  }
});

test('when no ADMIN_TOKEN is configured, an empty token is not accepted', () => {
  config.adminToken = '';
  assert.equal(run(undefined).err?.status, 401);
  assert.equal(run('Bearer ').err?.status, 401);
});
