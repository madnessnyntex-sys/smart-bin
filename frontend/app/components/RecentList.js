'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

function outcome(r) {
  if (r.rice_grams > 0) return { text: `+${r.rice_grams}g rice`, cls: 'font-medium text-paddy' };
  if (r.is_recyclable) return { text: 'Out of rice', cls: 'font-medium text-reject' };
  return { text: 'Rejected', cls: 'text-ink/60' };
}

// what to tell the user after an edit, based on what the backend decided
function describeEdit(r) {
  if (r.action === 'DISPENSE') return `Changed to ${r.item}. ${r.rice_grams}g of rice counted for it.`;
  if (r.action === 'OUT_OF_STOCK') return `Changed to ${r.item}. It's recyclable but the hopper didn't have enough rice, so 0g counted.`;
  return `Changed to ${r.item}. It isn't recyclable, so no rice counted.`;
}

const link = 'text-xs text-paddy underline disabled:opacity-50';

// onDone reloads the dashboard data after a change
export default function RecentList({ recent, onDone }) {
  const [types, setTypes] = useState([]);
  const [editingId, setEditingId] = useState(null); // which row is being edited, if any
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  // the list of items to pick from when editing
  useEffect(() => {
    api('/api/waste-types').then(setTypes).catch(() => setTypes([]));
  }, []);

  function startEdit(r) {
    setEditingId(r.id);
    setChoice(r.name);
    setMsg(null);
  }

  async function save(r) {
    setBusy(true);
    try {
      const result = await api(`/api/detections/${r.id}`, { method: 'PATCH', body: JSON.stringify({ item: choice }) });
      setMsg({ ok: true, text: describeEdit(result) });
      setEditingId(null);
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function remove(r) {
    const back = r.rice_grams > 0 ? ` The ${r.rice_grams}g of rice goes back into the hopper count.` : '';
    if (!window.confirm(`Delete this ${r.name} detection?${back}`)) return;
    setBusy(true);
    try {
      const result = await api(`/api/detections/${r.id}`, { method: 'DELETE' });
      setMsg({ ok: true, text: `Deleted. ${result.rice_returned_grams}g put back into the hopper count.` });
      setEditingId(null);
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg bg-white p-6">
      <h2 className="mb-1 text-xl font-semibold">Recent detections</h2>
      {recent.length === 0 ? (
        <p className="text-sm text-ink/60">Nothing yet.</p>
      ) : (
        <>
          <p className="mb-4 text-xs text-ink/60">
            Use Edit or Delete to fix a wrong detection. This corrects the records and the hopper count only.
            Rice that already came out stays out.
          </p>
          <ul className="divide-y divide-ink/10">
            {recent.map((r) => {
              const o = outcome(r);
              const editing = editingId === r.id;
              return (
                <li key={r.id} className="py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span>
                      {r.name}
                      {r.confidence != null && <span className="ml-2 text-ink/50">{Math.round(r.confidence * 100)}%</span>}
                    </span>
                    <span className={o.cls}>{o.text}</span>
                  </div>

                  {editing ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select value={choice} onChange={(e) => setChoice(e.target.value)}
                              aria-label={`Correct item for detection ${r.id}`}
                              className="rounded border border-ink/20 p-1 text-sm">
                        {types.map((w) => <option key={w.id} value={w.name}>{w.name}</option>)}
                      </select>
                      <button type="button" onClick={() => save(r)} disabled={busy || choice === r.name} className={link}>Save</button>
                      <button type="button" onClick={() => setEditingId(null)} disabled={busy} className={link}>Cancel</button>
                    </div>
                  ) : (
                    <div className="mt-1 flex gap-3">
                      <button type="button" onClick={() => startEdit(r)} disabled={busy} className={link}>Edit</button>
                      <button type="button" onClick={() => remove(r)} disabled={busy} className={`${link} !text-reject`}>Delete</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {msg && <p role="status" className={`mt-4 text-sm font-medium ${msg.ok ? 'text-paddy' : 'text-reject'}`}>{msg.text}</p>}
    </section>
  );
}
