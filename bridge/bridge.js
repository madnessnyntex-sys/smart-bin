// Connects the Arduino (USB serial) to the backend (HTTP).
// Run it with `npm start` after copying .env.example to .env.
const readline = require('node:readline');
const { SerialPort, ReadlineParser } = require('serialport');
const { createBridge } = require('./core');
const { cleanClassification } = require('./protocol');
const { classify } = require('./classify');
const { askMenu } = require('./menu');

const serialPath = process.env.SERIAL_PORT;
const baudRate = Number(process.env.BAUD_RATE) || 9600; // must match Serial.begin() in the sketch
const apiUrl = (process.env.API_URL || 'http://localhost:4000').replace(/\/+$/, '');
const apiKey = process.env.DEVICE_API_KEY;
const heartbeatMs = (Number(process.env.HEARTBEAT_SECONDS) || 30) * 1000;

const log = (text) => console.log(`[${new Date().toLocaleTimeString()}] ${text}`);

if (!serialPath || !apiKey) {
  console.error('SERIAL_PORT and DEVICE_API_KEY must be set. Copy bridge/.env.example to bridge/.env and fill them in.');
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const port = new SerialPort({ path: serialPath, baudRate, autoOpen: false });

// First ask the camera model. While classify() is still empty (returns null), ask in the terminal.
async function getItem(signal) {
  const fromCamera = cleanClassification(await classify());
  return fromCamera || askMenu(rl, signal);
}

const bridge = createBridge({
  apiUrl,
  apiKey,
  getItem,
  log,
  sendLine: (text) => port.write(`${text}\n`, (err) => err && log(`Serial write failed: ${err.message}`)),
});

// Tells the user what is wrong when the port can't be opened, and which ports do exist.
async function explainOpenError(err) {
  console.error(`\nCan't open ${serialPath}: ${err.message}`);
  console.error('Check that the Arduino is plugged in, that SERIAL_PORT is right, and that the Arduino IDE Serial Monitor is closed (it keeps the port busy).');
  try {
    const ports = await SerialPort.list();
    console.error(ports.length
      ? `Ports found: ${ports.map((p) => `${p.path}${p.manufacturer ? ` (${p.manufacturer})` : ''}`).join(', ')}`
      : 'No serial ports found at all.');
  } catch {
    // listing is only a hint
  }
  process.exit(1);
}

port.open((err) => {
  if (err) return explainOpenError(err);
  log(`Listening on ${serialPath} at ${baudRate} baud. Backend: ${apiUrl}`);

  // Arduino messages arrive one per line
  port.pipe(new ReadlineParser({ delimiter: '\n' })).on('data', (line) => bridge.handleLine(line));

  // keep the dashboard's Online light on. Only print when it changes, so a long outage doesn't flood the screen.
  let wasOk = null;
  const beat = async () => {
    const ok = await bridge.heartbeat();
    if (ok && wasOk !== true) log('Backend heartbeat OK.');
    wasOk = ok;
  };
  beat();
  setInterval(beat, heartbeatMs);
});

port.on('error', (err) => log(`Serial error: ${err.message}`));
port.on('close', () => {
  log('Serial port closed (was the Arduino unplugged?). Plug it back in and restart the bridge.');
  process.exit(1);
});

process.on('SIGINT', () => {
  rl.close();
  if (port.isOpen) port.close();
  process.exit(0);
});
