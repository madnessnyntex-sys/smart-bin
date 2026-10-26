export default function TopItems({ byItem, total, days }) {
  const top = byItem[0];
  const max = top?.count || 1;
  return (
    <section className="rounded-lg bg-white p-6">
      <h2 className="text-xl font-semibold">{top ? `Most detected: ${top.name}` : 'No detections yet'}</h2>
      <p className="mb-5 text-sm text-ink/60">
        {top
          ? `${top.count} of ${total} items in the last ${days} days. This is the data a business owner would pay for.`
          : 'Drop an item in the bin to start collecting data.'}
      </p>
      <ul className="space-y-3">
        {byItem.map((row) => (
          <li key={row.name}>
            <div className="mb-1 flex justify-between text-sm">
              <span>{row.name} <span className="text-ink/50">({row.category})</span></span>
              <span className="font-medium">{row.count}</span>
            </div>
            <div className="h-3 rounded bg-steel">
              <div className={`h-3 rounded ${row.is_recyclable ? 'bg-grain' : 'bg-ink/30'}`}
                   style={{ width: `${(row.count / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
