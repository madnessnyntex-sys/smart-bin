// The messages between the Arduino and this program, as small pure functions
// (no serial port, no network), so they are easy to test.

// Turns one line from the Arduino into { type, ... }.
function parseArduinoLine(line) {
  const text = String(line).trim();
  if (text === '') return { type: 'EMPTY' };
  if (['READY', 'DETECT', 'DONE', 'TIMEOUT'].includes(text)) return { type: text };
  if (/^DIST \d+$/.test(text)) return { type: 'DIST' }; // only printed while tuning the sensor
  return { type: 'UNKNOWN', text };
}

// Turns the backend's answer into the line we send to the Arduino.
// Anything odd becomes ERROR, so the Arduino never gives rice by accident.
function actionToCommand(result) {
  if (!result || typeof result !== 'object') return 'ERROR';
  if (result.action === 'DISPENSE') {
    const grams = result.rice_grams;
    return Number.isInteger(grams) && grams > 0 ? `DISPENSE,${grams}` : 'ERROR';
  }
  if (result.action === 'REJECT') return 'REJECT';
  if (result.action === 'OUT_OF_STOCK') return 'OUT_OF_STOCK';
  return 'ERROR';
}

// Checks what classify() (the camera) returned.
// null or undefined means "no camera yet". A malformed answer throws, so a broken camera
// shows up as an error instead of a wrong item.
function cleanClassification(result) {
  if (result === null || result === undefined) return null;
  const item = typeof result.item === 'string' ? result.item.trim() : '';
  if (item === '' || item.length > 60) throw new Error('classify() must return an item name of 1 to 60 characters');
  const clean = { item };
  if (result.confidence !== undefined) {
    const c = result.confidence;
    if (typeof c !== 'number' || c < 0 || c > 1) throw new Error('classify() confidence must be a number from 0 to 1');
    clean.confidence = c;
  }
  return clean;
}

module.exports = { parseArduinoLine, actionToCommand, cleanClassification };
