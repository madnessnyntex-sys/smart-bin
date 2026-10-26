'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

function describe(r) {
  if (r.action === 'DISPENSE') return { ok: true, text: `${r.item} accepted. ${r.rice_grams}g of rice released.` };
  if (r.action === 'OUT_OF_STOCK') return { ok: false, text: `${r.item} is recyclable but the hopper is out of rice.` };
  return { ok: false, text: `${r.item} isn't recyclable. Rejected, no rice.` };
}

export default function SimulatePanel({ onDone }) {
  const [types, setTypes] = useState([]);
  const [item, setItem] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/waste-types')
      .then((t) => { setTypes(t); setItem(t[0]?.name || ''); })
      .catch((e) => setMsg({ ok: false, text: e.message }));
  }, []);

  async function drop() {
    setBusy(true);
    try {
      const r = await api('/api/dev/simulate', { method: 'POST', body: JSON.stringify({ item }) });
      setMsg(describe(r));
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg bg-white p-6">
      <h2 className="mb-1 text-xl font-semibold">Simulate a deposit</h2>
      <p className="mb-4 text-sm text-ink/60">Fakes what the sensor and camera send, for demos without the hardware.</p>
      <label htmlFor="item" className="mb-1 block text-sm">Item</label>
      <select id="item" value={item} onChange={(e) => setItem(e.target.value)}
              className="mb-4 w-full rounded border border-ink/20 p-2">
        {types.map((w) => <option key={w.id} value={w.name}>{w.name}</option>)}
      </select>
      <button onClick={drop} disabled={busy || !item}
              className="rounded bg-paddy px-4 py-2 font-medium text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paddy">
        {busy ? 'Sending...' : 'Drop item in bin'}
      </button>
      {msg && <p role="status" className={`mt-4 text-sm font-medium ${msg.ok ? 'text-paddy' : 'text-reject'}`}>{msg.text}</p>}
    </section>
  );
}
