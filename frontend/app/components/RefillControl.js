'use client';
import { useState } from 'react';
import { api } from '../lib/api';

const MAX_GRAMS = 100000; // same limit the backend enforces

// Lets a logged-in user add rice to one hopper. It calls the refill endpoint,
// which never lets the hopper go over its capacity.
export default function RefillControl({ device, onDone }) {
  const room = device.rice_capacity_grams - device.rice_stock_grams; // how much more fits
  const [grams, setGrams] = useState('1000');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const amount = Number(grams);
  const validAmount = Number.isInteger(amount) && amount > 0 && amount <= MAX_GRAMS;

  async function refill(toAdd) {
    setBusy(true);
    setMsg(null);
    try {
      const updated = await api(`/api/devices/${device.id}/refill`, {
        method: 'POST',
        body: JSON.stringify({ grams: toAdd }),
      });
      // the backend returns the new stock, so the difference is what really went in
      const added = updated.rice_stock_grams - device.rice_stock_grams;
      setMsg({
        ok: true,
        text: added < toAdd ? `Hopper is full. Added ${added}g (that's all that fit).` : `Added ${added}g of rice.`,
      });
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  const button = 'rounded px-3 py-1 text-sm font-medium disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paddy';

  return (
    <div className="mt-2">
      {room === 0 ? (
        <p className="text-sm text-ink/60">Hopper is full.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input type="number" min="1" max={MAX_GRAMS} step="1" value={grams}
                 onChange={(e) => setGrams(e.target.value)}
                 aria-label={`Grams of rice to add to ${device.name}`}
                 className="w-24 rounded border border-ink/20 p-1 text-sm" />
          <span className="text-sm text-ink/60">g</span>
          <button type="button" onClick={() => refill(amount)} disabled={busy || !validAmount}
                  className={`${button} bg-paddy text-white`}>
            {busy ? 'Adding...' : 'Refill rice'}
          </button>
          <button type="button" onClick={() => refill(room)} disabled={busy}
                  className={`${button} border border-paddy text-paddy`}>
            Fill to full
          </button>
        </div>
      )}
      {msg && <p role="status" className={`mt-1 text-sm font-medium ${msg.ok ? 'text-paddy' : 'text-reject'}`}>{msg.text}</p>}
    </div>
  );
}
