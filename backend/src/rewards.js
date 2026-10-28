// The one rule that decides what the bin does. Kept pure so it's easy to test
// and so the hardware side only has to follow the `action` it gets back.
const ACTIONS = { DISPENSE: 'DISPENSE', REJECT: 'REJECT', OUT_OF_STOCK: 'OUT_OF_STOCK' };

function decideAction({ recyclable, rewardGrams, stockGrams }) {
  if (!recyclable || rewardGrams <= 0) return { action: ACTIONS.REJECT, riceGrams: 0 };
  if (stockGrams < rewardGrams) return { action: ACTIONS.OUT_OF_STOCK, riceGrams: 0 };
  return { action: ACTIONS.DISPENSE, riceGrams: rewardGrams };
}

// Puts rice back into the hopper count, but never above what the hopper can hold.
function giveBackRice({ stockGrams, capacityGrams, riceGrams }) {
  return Math.min(capacityGrams, stockGrams + riceGrams);
}

// Used when a detection was saved with the wrong item. First the rice that record used goes
// back into the count, then the new item is judged exactly like a fresh detection
// (so the same decideAction rule applies). Returns what the record and the hopper should become.
function correctDetection({ oldRiceGrams, recyclable, rewardGrams, stockGrams, capacityGrams }) {
  const available = giveBackRice({ stockGrams, capacityGrams, riceGrams: oldRiceGrams });
  const { action, riceGrams } = decideAction({ recyclable, rewardGrams, stockGrams: available });
  return { action, riceGrams, stockGrams: available - riceGrams };
}

module.exports = { ACTIONS, decideAction, giveBackRice, correctDetection };
