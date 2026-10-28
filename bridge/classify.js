// YOUR CAMERA MODEL GOES HERE.
//
// The bridge calls classify() every time the Arduino says an item is in the bin.
// When your camera model is ready, take a photo, run the model, and return:
//
//     return { item: 'Water bottle', confidence: 0.93 };
//
// - item must be one of the names in backend/schema.sql (waste_types). Any other name is
//   still saved by the backend, but as "Unrecognized", and rejected.
// - confidence is optional, a number from 0 to 1.
//
// Until then this returns null, which makes the bridge ask you to pick the item in the terminal.
// If this function throws an error, the bridge tells the Arduino ERROR (no rice, item pushed out).
async function classify() {
  return null;
}

module.exports = { classify };
