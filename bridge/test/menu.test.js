// Tests the terminal menu with a fake keyboard (no real terminal needed).
const test = require('node:test');
const assert = require('node:assert/strict');
const readline = require('node:readline');
const { PassThrough } = require('node:stream');
const { askMenu, ITEMS } = require('../menu');

function fakeTerminal() {
  const input = new PassThrough();
  const rl = readline.createInterface({ input, output: new PassThrough() });
  return { rl, type: (text) => input.write(text) };
}

// the menu prints the list with console.log, keep the test output clean
test.beforeEach((t) => { t.mock.method(console, 'log', () => {}); });

test('typing a valid number picks that item', async () => {
  const { rl, type } = fakeTerminal();
  const result = askMenu(rl, new AbortController().signal);
  type('2\n');
  assert.deepEqual(await result, { item: ITEMS[1] });
  rl.close();
});

test('wrong answers are asked again until a good one comes', async () => {
  const { rl, type } = fakeTerminal();
  const result = askMenu(rl, new AbortController().signal);
  type('hello\n');
  await new Promise((r) => setTimeout(r, 10));
  type('99\n');
  await new Promise((r) => setTimeout(r, 10));
  type('1\n');
  assert.deepEqual(await result, { item: ITEMS[0] });
  rl.close();
});

test('aborting while waiting closes the menu with null', async () => {
  const { rl } = fakeTerminal();
  const controller = new AbortController();
  const result = askMenu(rl, controller.signal);
  await new Promise((r) => setTimeout(r, 10));
  controller.abort();
  assert.equal(await result, null);
  rl.close();
});

test('an already aborted signal returns null without asking', async () => {
  const { rl } = fakeTerminal();
  const controller = new AbortController();
  controller.abort();
  assert.equal(await askMenu(rl, controller.signal), null);
  rl.close();
});

test('the menu works again after one was aborted', async () => {
  const { rl, type } = fakeTerminal();
  const first = new AbortController();
  const aborted = askMenu(rl, first.signal);
  await new Promise((r) => setTimeout(r, 10));
  first.abort();
  assert.equal(await aborted, null);

  const second = askMenu(rl, new AbortController().signal);
  type('4\n');
  assert.deepEqual(await second, { item: ITEMS[3] });
  rl.close();
});
