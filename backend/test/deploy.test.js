// Things that matter when the API runs on Vercel instead of your own computer. No database needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const backend = path.join(__dirname, '..');
const configPath = path.join(backend, 'src/config.js');

// Our own environment, minus anything that would change how the config behaves,
// plus whatever the test sets. Without this, a real backend/.env or a leftover variable
// could change the result.
function cleanEnv(extraEnv = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(DB_|JWT_|CORS_|NODE_ENV|VERCEL|REGISTER_|ADMIN_|BIN_API_KEY|PORT)/.test(key)) delete env[key];
  }
  return { ...env, ...extraEnv };
}

// Runs code (or a script file) in a fresh Node process. It starts in an empty folder so
// dotenv can't pick up the real backend/.env.
function runNode(args, extraEnv) {
  return spawnSync(process.execPath, args, { cwd: os.tmpdir(), env: cleanEnv(extraEnv), encoding: 'utf8' });
}

function readConfig(extraEnv) {
  const res = runNode(['-e', `console.log(JSON.stringify(require(${JSON.stringify(configPath)})))`], extraEnv);
  assert.equal(res.status, 0, res.stderr);
  return JSON.parse(res.stdout.trim().split('\n').pop()); // the last line, in case something printed a warning first
}

test('config defaults suit a local computer', () => {
  const c = readConfig({});
  assert.deepEqual(c.corsOrigins, ['http://localhost:3000']);
  assert.equal(c.trustProxy, 0);
  assert.equal(c.db.connectionLimit, 10);
  assert.equal('ssl' in c.db, false);
});

test('CORS_ORIGIN can list several websites', () => {
  const c = readConfig({ CORS_ORIGIN: 'https://bin.vercel.app, https://bin-git-main.vercel.app ,' });
  assert.deepEqual(c.corsOrigins, ['https://bin.vercel.app', 'https://bin-git-main.vercel.app']);
});

test('on Vercel the proxy is trusted and fewer database connections are used', () => {
  const c = readConfig({ VERCEL: '1' });
  assert.equal(c.trustProxy, 1);
  assert.equal(c.db.connectionLimit, 3);
  assert.equal(readConfig({ VERCEL: '1', DB_POOL_SIZE: '5' }).db.connectionLimit, 5);
});

test('DB_SSL turns on an encrypted database connection that checks the certificate', () => {
  const c = readConfig({ DB_SSL: 'true' });
  assert.deepEqual(c.db.ssl, { rejectUnauthorized: true });
  assert.equal('ssl' in readConfig({ DB_SSL: 'false' }).db, false);
});

test('DB_SSL_CA turns \\n into real line breaks', () => {
  const c = readConfig({ DB_SSL: 'true', DB_SSL_CA: '-----BEGIN CERTIFICATE-----\\nabc\\n-----END CERTIFICATE-----' });
  assert.equal(c.db.ssl.ca, '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----');
});

test('production refuses to start without a strong JWT_SECRET', () => {
  const load = ['-e', `require(${JSON.stringify(configPath)})`];
  const missing = runNode(load, { NODE_ENV: 'production' });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /JWT_SECRET must be set/);

  const short = runNode(load, { NODE_ENV: 'production', JWT_SECRET: 'too-short' });
  assert.notEqual(short.status, 0);
  assert.match(short.stderr, /at least 32/);

  const good = runNode(load, { NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) });
  assert.equal(good.status, 0, good.stderr);
});

test('the CORS setting lets listed websites in and keeps others out', async () => {
  const config = require('../src/config');
  config.corsOrigins = ['https://bin.vercel.app', 'https://bin-git-main.vercel.app'];
  const server = require('../src/app').createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const url = `http://127.0.0.1:${server.address().port}/api/nope`;
  try {
    for (const origin of config.corsOrigins) {
      assert.equal((await fetch(url, { headers: { Origin: origin } })).headers.get('access-control-allow-origin'), origin);
    }
    const stranger = await fetch(url, { headers: { Origin: 'https://evil.example.com' } });
    assert.equal(stranger.headers.get('access-control-allow-origin'), null);
  } finally {
    server.close();
  }
});

test('trust proxy is switched on only when configured', () => {
  const config = require('../src/config');
  const { createApp } = require('../src/app');
  config.trustProxy = 0;
  assert.equal(createApp().get('trust proxy'), false);
  config.trustProxy = 1;
  assert.equal(createApp().get('trust proxy'), 1);
});

test('the Vercel entry file exports a working Express app', async () => {
  const app = require('../api/index.js');
  assert.equal(typeof app, 'function');
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  try {
    // no database is touched: an unknown route is answered with JSON 404
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/nope`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'Not found' });
  } finally {
    server.close();
  }
});

test('vercel.json sends every URL to the API function', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(backend, 'vercel.json'), 'utf8'));
  assert.deepEqual(vercel.rewrites, [{ source: '/(.*)', destination: '/api' }]);
});

test('db:init takes out CREATE DATABASE and USE but keeps the tables', () => {
  const { schemaWithoutDatabaseLines } = require('../scripts/init-db');
  const original = fs.readFileSync(path.join(backend, 'schema.sql'), 'utf8');
  assert.match(original, /CREATE DATABASE/);
  const cleaned = schemaWithoutDatabaseLines(original);
  assert.doesNotMatch(cleaned, /CREATE DATABASE/i);
  assert.doesNotMatch(cleaned, /^\s*USE /im);
  for (const table of ['devices', 'waste_types', 'detections', 'users']) {
    assert.match(cleaned, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(cleaned, /INSERT IGNORE INTO devices/);
});

test('db:init refuses a remote database that would keep the public dev key', () => {
  const script = path.join(backend, 'scripts/init-db.js');

  // both of these stop before any connection is made, so no database is needed
  const noKey = runNode([script], { DB_HOST: 'db.example.com' });
  assert.notEqual(noKey.status, 0);
  assert.match(noKey.stderr, /BIN_API_KEY/);

  const shortKey = runNode([script], { DB_HOST: 'db.example.com', BIN_API_KEY: 'short' });
  assert.notEqual(shortKey.status, 0);
  assert.match(shortKey.stderr, /at least 20 characters/);
});
