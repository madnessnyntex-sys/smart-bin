// Runs the bridge against a fake backend (a tiny local HTTP server). No Arduino, no real backend.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createBridge } = require('../core');

// A fake backend. `reply` decides what each request gets; every request is recorded.
async function fakeBackend(reply) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      requests.push({ method: req.method, url: req.url, key: req.headers['x-api-key'], body: body && JSON.parse(body) });
      const { status = 200, json = {}, delayMs = 0 } = await reply(requests.length);
      setTimeout(() => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(json));
      }, delayMs);
    });
  });
  await new Promise((r) => server.listen(0, r));
  return { url: `http://127.0.0.1:${server.address().port}`, requests, close: () => server.close() };
}

// A bridge wired to a fake backend, a fake Arduino (records what we send it) and a fake item picker.
async function setup({ reply, getItem, requestTimeoutMs }) {
  const backend = await fakeBackend(reply || (() => ({ status: 201, json: { id: 5, item: 'Soda can', action: 'DISPENSE', rice_grams: 25, stock_left: 975 } })));
  const sent = [];
  const logs = [];
  const bridge = createBridge({
    apiUrl: backend.url,
    apiKey: 'test-key',
    getItem: getItem || (async () => ({ item: 'Soda can', confidence: 0.9 })),
    sendLine: (text) => sent.push(text),
    log: (text) => logs.push(text),
    requestTimeoutMs,
  });
  return { backend, bridge, sent, logs };
}

test('DETECT -> backend -> DISPENSE,grams goes back to the Arduino', async () => {
  const { backend, bridge, sent } = await setup({});
  await bridge.handleLine('DETECT');
  assert.deepEqual(sent, ['DISPENSE,25']);
  const [req] = backend.requests;
  assert.equal(req.method, 'POST');
  assert.equal(req.url, '/api/device/detections');
  assert.equal(req.key, 'test-key');
  assert.deepEqual(req.body, { item: 'Soda can', confidence: 0.9 });
  backend.close();
});

test('REJECT and OUT_OF_STOCK are passed on', async () => {
  for (const action of ['REJECT', 'OUT_OF_STOCK']) {
    const { backend, bridge, sent } = await setup({ reply: () => ({ status: 201, json: { id: 1, action, rice_grams: 0, stock_left: 10 } }) });
    await bridge.handleLine('DETECT');
    assert.deepEqual(sent, [action]);
    backend.close();
  }
});

test('the bridge can handle one item after another', async () => {
  const { backend, bridge, sent } = await setup({});
  await bridge.handleLine('DETECT');
  await bridge.handleLine('DONE');
  await bridge.handleLine('DETECT');
  assert.deepEqual(sent, ['DISPENSE,25', 'DISPENSE,25']);
  backend.close();
});

test('backend errors (401, 500, bad answer) all send ERROR, never rice', async () => {
  for (const status of [401, 500, 404]) {
    const { backend, bridge, sent, logs } = await setup({ reply: () => ({ status, json: { error: 'nope' } }) });
    await bridge.handleLine('DETECT');
    assert.deepEqual(sent, ['ERROR'], `status ${status}`);
    assert.ok(logs.some((l) => l.startsWith('Problem:')));
    backend.close();
  }
  // a 200 that isn't a real answer
  const { backend, bridge, sent } = await setup({ reply: () => ({ status: 200, json: { hello: 'world' } }) });
  await bridge.handleLine('DETECT');
  assert.deepEqual(sent, ['ERROR']);
  backend.close();
});

test('a wrong device key gives a helpful message', async () => {
  const { backend, bridge, logs } = await setup({ reply: () => ({ status: 401, json: { error: 'Invalid API key' } }) });
  await bridge.handleLine('DETECT');
  assert.ok(logs.some((l) => l.includes('DEVICE_API_KEY')));
  backend.close();
});

test('backend not running sends ERROR', async () => {
  const { backend, bridge, sent, logs } = await setup({});
  backend.close();
  await new Promise((r) => setTimeout(r, 50));
  await bridge.handleLine('DETECT');
  assert.deepEqual(sent, ['ERROR']);
  assert.ok(logs.some((l) => l.includes("Can't reach the backend")));
});

test('a backend that is too slow sends ERROR and is not retried', async () => {
  const { backend, bridge, sent, logs } = await setup({ reply: () => ({ status: 201, json: { action: 'DISPENSE', rice_grams: 25 }, delayMs: 300 }), requestTimeoutMs: 50 });
  await bridge.handleLine('DETECT');
  assert.deepEqual(sent, ['ERROR']);
  assert.ok(logs.some((l) => l.includes('check the dashboard')));
  assert.equal(backend.requests.length, 1, 'must not retry');
  await new Promise((r) => setTimeout(r, 300));
  backend.close();
});

test('a second DETECT while busy is ignored', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const { backend, bridge, sent } = await setup({ getItem: async () => { await gate; return { item: 'Soda can' }; } });
  const first = bridge.handleLine('DETECT');
  await bridge.handleLine('DETECT');
  release();
  await first;
  assert.equal(backend.requests.length, 1);
  assert.deepEqual(sent, ['DISPENSE,25']);
  backend.close();
});

test('TIMEOUT while the item is still being chosen cancels everything: no request, no reply', async () => {
  let seenSignal;
  const { backend, bridge, sent } = await setup({
    getItem: (signal) => new Promise((resolve) => { seenSignal = signal; signal.addEventListener('abort', () => resolve(null)); }),
  });
  const pending = bridge.handleLine('DETECT');
  await bridge.handleLine('TIMEOUT');
  await pending;
  assert.equal(seenSignal.aborted, true);
  assert.equal(backend.requests.length, 0);
  assert.deepEqual(sent, []);
  backend.close();
});

test('TIMEOUT while the backend is answering: nothing is sent, and the log says how to fix the count', async () => {
  const { backend, bridge, sent, logs } = await setup({
    reply: () => ({ status: 201, json: { id: 42, action: 'DISPENSE', rice_grams: 25, stock_left: 975 }, delayMs: 150 }),
  });
  const pending = bridge.handleLine('DETECT');
  await new Promise((r) => setTimeout(r, 40));
  await bridge.handleLine('TIMEOUT');
  await pending;
  assert.deepEqual(sent, []);
  assert.ok(logs.some((l) => l.includes('#42') && l.includes('Delete it on the dashboard')));
  backend.close();
});

test('a TIMEOUT with nothing in progress does nothing', async () => {
  const { backend, bridge, sent } = await setup({});
  await bridge.handleLine('TIMEOUT');
  assert.deepEqual(sent, []);
  backend.close();
});

test('after a TIMEOUT the next item works normally', async () => {
  let calls = 0;
  const { backend, bridge, sent } = await setup({
    // the first item waits until the Arduino gives up, the second is answered at once
    getItem: (signal) => (calls++ === 0
      ? new Promise((resolve) => signal.addEventListener('abort', () => resolve(null)))
      : Promise.resolve({ item: 'Soda can' })),
  });
  const pending = bridge.handleLine('DETECT');
  await bridge.handleLine('TIMEOUT');
  await pending;
  await bridge.handleLine('DETECT'); // the same bridge, a new item
  assert.deepEqual(sent, ['DISPENSE,25']);
  assert.equal(backend.requests.length, 1);
  backend.close();
});

test('if choosing the item fails or gives nothing, the Arduino gets ERROR', async () => {
  for (const getItem of [async () => { throw new Error('camera broke'); }, async () => null]) {
    const { backend, bridge, sent } = await setup({ getItem });
    await bridge.handleLine('DETECT');
    assert.deepEqual(sent, ['ERROR']);
    assert.equal(backend.requests.length, 0);
    backend.close();
  }
});

test('a failing serial write does not crash the bridge', async () => {
  const backend = await fakeBackend(() => ({ status: 201, json: { id: 1, action: 'REJECT', rice_grams: 0, stock_left: 1 } }));
  const logs = [];
  const bridge = createBridge({
    apiUrl: backend.url, apiKey: 'k', getItem: async () => ({ item: 'Styrofoam' }),
    sendLine: () => { throw new Error('port is closed'); }, log: (t) => logs.push(t),
  });
  await bridge.handleLine('DETECT');
  assert.ok(logs.some((l) => l.includes('port is closed')));
  backend.close();
});

test('junk lines, READY, DONE and DIST do not start anything', async () => {
  const { backend, bridge, sent } = await setup({});
  for (const line of ['READY', 'DONE', 'DIST 10', '', 'garbage\u0000', 'DETECTED']) await bridge.handleLine(line);
  assert.equal(backend.requests.length, 0);
  assert.deepEqual(sent, []);
  backend.close();
});

test('heartbeat posts with the key and reports success or failure', async () => {
  const { backend, bridge } = await setup({ reply: () => ({ status: 200, json: { ok: true } }) });
  assert.equal(await bridge.heartbeat(), true);
  assert.equal(backend.requests[0].url, '/api/device/heartbeat');
  assert.equal(backend.requests[0].key, 'test-key');
  backend.close();

  const bad = await setup({ reply: () => ({ status: 401, json: { error: 'Invalid API key' } }) });
  assert.equal(await bad.bridge.heartbeat(), false);
  bad.backend.close();
});
