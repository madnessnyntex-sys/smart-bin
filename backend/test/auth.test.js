// Password hashing and login tokens. No database needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const config = require('../src/config');
const { hashPassword, verifyPassword, DUMMY_HASH, signToken, verifyToken, sameSecret } = require('../src/auth');
const { registerBody, loginBody } = require('../src/schemas');

test('a password is hashed, not stored, and still verifies', async () => {
  const hash = await hashPassword('correct horse');
  assert.notEqual(hash, 'correct horse');
  assert.equal(await verifyPassword('correct horse', hash), true);
  assert.equal(await verifyPassword('wrong horse', hash), false);
});

test('hashing the same password twice gives different hashes (salted)', async () => {
  assert.notEqual(await hashPassword('same password'), await hashPassword('same password'));
});

test('the dummy hash never matches a real attempt', async () => {
  assert.equal(await verifyPassword('anything', DUMMY_HASH), false);
});

test('a signed token comes back as the same user', () => {
  const user = verifyToken(signToken({ id: 7, email: 'me@example.com' }));
  assert.deepEqual(user, { id: 7, email: 'me@example.com' });
});

test('garbage, tampered and wrongly signed tokens are rejected', () => {
  assert.equal(verifyToken('nonsense'), null);
  assert.equal(verifyToken(''), null);
  const good = signToken({ id: 1, email: 'a@b.co' });
  const [head, body, sig] = good.split('.');
  const forgedBody = Buffer.from(JSON.stringify({ sub: 2, email: 'admin@b.co' })).toString('base64url');
  assert.equal(verifyToken(`${head}.${forgedBody}.${sig}`), null);
  assert.equal(verifyToken(jwt.sign({ sub: 1, email: 'a@b.co' }, 'some-other-secret')), null);
});

test('an expired token is rejected', () => {
  const old = jwt.sign({ sub: 1, email: 'a@b.co' }, config.jwtSecret, { expiresIn: -10 });
  assert.equal(verifyToken(old), null);
});

test('a token with no signature ("alg none") is rejected', () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  assert.equal(verifyToken(`${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 1, email: 'a@b.co' })}.`), null);
});

test('sameSecret only matches identical strings', () => {
  assert.equal(sameSecret('abc', 'abc'), true);
  assert.equal(sameSecret('abc', 'abd'), false);
  assert.equal(sameSecret('abc', 'abcd'), false);
});

test('register body: email is lowercased, short and over-long passwords are refused', () => {
  const ok = registerBody.parse({ email: ' Me@Example.COM ', password: 'longenough1', inviteCode: 'code' });
  assert.equal(ok.email, 'me@example.com');
  assert.equal(registerBody.safeParse({ email: 'a@b.co', password: 'short', inviteCode: 'code' }).success, false);
  assert.equal(registerBody.safeParse({ email: 'a@b.co', password: 'x'.repeat(73), inviteCode: 'code' }).success, false);
  assert.equal(registerBody.safeParse({ email: 'a@b.co', password: 'longenough1' }).success, false);
});

test('login body needs an email and a password', () => {
  assert.equal(loginBody.safeParse({ email: 'a@b.co', password: 'x' }).success, true);
  assert.equal(loginBody.safeParse({ email: 'a@b.co', password: '' }).success, false);
});
