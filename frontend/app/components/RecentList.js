function outcome(r) {
  if (r.rice_grams > 0) return { text: `+${r.rice_grams}g rice`, cls: 'font-medium text-paddy' };
  if (r.is_recyclable) return { text: 'Out of rice', cls: 'font-medium text-reject' };
  return { text: 'Rejected', cls: 'text-ink/60' };
}

export default function RecentList({ recent }) {
  return (
    <section className="rounded-lg bg-white p-6">
      <h2 className="mb-4 text-xl font-semibold">Recent detections</h2>
      {recent.length === 0 ? (
        <p className="text-sm text-ink/60">Nothing yet.</p>
      ) : (
        <ul className="divide-y divide-ink/10">
          {recent.map((r) => {
            const o = outcome(r);
            return (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {r.name}
                  {r.confidence != null && <span className="ml-2 text-ink/50">{Math.round(r.confidence * 100)}%</span>}
                </span>
                <span className={o.cls}>{o.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
