// The brain of the bridge. It knows nothing about the serial port or the terminal:
// those are handed in, so the same code can be tested without any hardware.
//
//   handleLine(line)   call this with every line the Arduino sends
//   sendLine(text)     handed in: writes one line to the Arduino
//   getItem(signal)    handed in: works out what the item is. Returns { item, confidence? },
//                      or null if `signal` was aborted first
//
// The flow for one item:  DETECT -> getItem -> POST /api/device/detections -> send the answer back.
const { parseArduinoLine, actionToCommand } = require('./protocol');

function createBridge({ apiUrl, apiKey, getItem, sendLine, log = console.log, requestTimeoutMs = 8000 }) {
  // The item being handled right now, or null. The Arduino only asks about one item at a time.
  let current = null;

  // Writes a line to the Arduino. A broken cable must not crash the bridge.
  function safeSend(text) {
    try {
      sendLine(text);
    } catch (err) {
      log(`Couldn't write "${text}" to the Arduino: ${err.message}`);
    }
  }

  // POSTs to the backend with the bin's key. Throws an Error with a message a person can act on.
  async function callBackend(path, body) {
    let res;
    try {
      res = await fetch(`${apiUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    } catch (err) {
      if (err.name === 'TimeoutError') {
        throw new Error(`The backend didn't answer within ${requestTimeoutMs / 1000}s. It may still have saved the detection, so check the dashboard.`);
      }
      throw new Error(`Can't reach the backend at ${apiUrl}. Is it running?`);
    }
    const data = await res.json().catch(() => null);
    if (res.status === 401) throw new Error('The backend refused the bin key. Check DEVICE_API_KEY in bridge/.env.');
    if (!res.ok) throw new Error(`The backend answered ${res.status}${data && data.error ? `: ${data.error}` : ''}`);
    return data;
  }

  async function onDetect() {
    if (current) {
      log('DETECT ignored: still busy with the last item.');
      return;
    }
    const cycle = { expired: false, abort: new AbortController() };
    current = cycle;
    try {
      const picked = await getItem(cycle.abort.signal);
      if (cycle.expired) return; // the Arduino gave up while we were working out the item
      if (!picked) throw new Error('No item was chosen');

      log(`Sending "${picked.item}" to the backend...`);
      // No retry on purpose: if the first try reached the backend, the rice is already
      // counted, and a second try would count it twice.
      const result = await callBackend('/api/device/detections', picked);
      const command = actionToCommand(result);

      if (cycle.expired) {
        // too late: the Arduino already pushed the item out without giving rice
        log(`The Arduino gave up before the backend answered. The backend saved detection #${result.id} (${result.action}, ${result.rice_grams}g) but nothing was dispensed. Delete it on the dashboard to put the rice back in the count.`);
        return;
      }
      log(`Backend: ${result.action}, ${result.rice_grams}g of rice, ${result.stock_left}g left. Telling the Arduino: ${command}`);
      safeSend(command);
    } catch (err) {
      log(`Problem: ${err.message}`);
      if (!cycle.expired) safeSend('ERROR'); // the Arduino gives no rice and pushes the item out
    } finally {
      current = null;
    }
  }

  // Marks the Arduino's heartbeat to the backend so the dashboard shows the bin as Online.
  async function heartbeat() {
    try {
      await callBackend('/api/device/heartbeat', {});
      return true;
    } catch (err) {
      log(`Heartbeat failed: ${err.message}`);
      return false;
    }
  }

  function handleLine(line) {
    const msg = parseArduinoLine(line);
    switch (msg.type) {
      case 'READY':
        log('Arduino is ready.');
        return undefined;
      case 'DETECT':
        log('Arduino: item detected.');
        return onDetect();
      case 'DONE':
        log('Arduino: finished with the item.');
        return undefined;
      case 'TIMEOUT':
        log('Arduino gave up waiting for an answer. It gave no rice and pushed the item out.');
        if (current) {
          current.expired = true;
          current.abort.abort(); // closes the terminal menu if it is open
        }
        return undefined;
      case 'UNKNOWN':
        log(`Arduino said: ${msg.text}`);
        return undefined;
      default: // EMPTY and DIST are not worth printing
        return undefined;
    }
  }

  return { handleLine, heartbeat };
}

module.exports = { createBridge };
