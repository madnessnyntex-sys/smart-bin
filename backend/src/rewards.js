// The one rule that decides what the bin does. Kept pure so it's easy to test
// and so the hardware side only has to follow the `action` it gets back.
const ACTIONS = { DISPENSE: 'DISPENSE', REJECT: 'REJECT', OUT_OF_STOCK: 'OUT_OF_STOCK' };

function decideAction({ recyclable, rewardGrams, stockGrams }) {
  if (!recyclable || rewardGrams <= 0) return { action: ACTIONS.REJECT, riceGrams: 0 };
  if (stockGrams < rewardGrams) return { action: ACTIONS.OUT_OF_STOCK, riceGrams: 0 };
  return { action: ACTIONS.DISPENSE, riceGrams: rewardGrams };
}

module.exports = { ACTIONS, decideAction };
