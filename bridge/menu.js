// The terminal menu used to pick the item while there is no camera model yet.

// These names must match backend/schema.sql (waste_types). The backend decides what each
// one is worth. A name it doesn't know is saved as "Unrecognized".
const ITEMS = [
  'Water bottle', 'Soda can', 'Glass bottle', 'Cardboard',
  'Junk food wrapper', 'Styrofoam', 'Food waste', 'Unrecognized',
];

// "3" -> "Glass bottle". Anything that isn't a number on the list -> null.
function pickFromMenu(answer, items = ITEMS) {
  const text = String(answer).trim();
  if (!/^\d+$/.test(text)) return null;
  return items[Number(text) - 1] || null;
}

// Asks one question in the terminal. Gives back null if `signal` is aborted first.
function ask(rl, prompt, signal) {
  return new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve(null), { once: true });
    rl.question(prompt, { signal }, resolve);
  });
}

// Shows the list and waits for a number. Returns { item }, or null if the Arduino gave up
// waiting (the bridge aborts `signal` when it sees TIMEOUT).
async function askMenu(rl, signal) {
  console.log('\nItem in the bin. What is it?');
  ITEMS.forEach((name, i) => console.log(`  ${i + 1}) ${name}`));
  while (!signal.aborted) {
    const answer = await ask(rl, 'Number: ', signal);
    if (answer === null) return null;
    const item = pickFromMenu(answer);
    if (item) return { item };
    console.log(`Type a number from 1 to ${ITEMS.length}.`);
  }
  return null;
}

module.exports = { ITEMS, pickFromMenu, askMenu };
