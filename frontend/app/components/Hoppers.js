import RefillControl from './RefillControl';

// onDone reloads the dashboard data after a refill
export default function Hoppers({ devices, onDone }) {
  return (
    <section className="rounded-lg bg-white p-6">
      <h2 className="mb-4 text-xl font-semibold">Rice hoppers</h2>
      {devices.map((d) => {
        const pct = Math.round((d.rice_stock_grams / d.rice_capacity_grams) * 100);
        const low = pct < 20;
        return (
          <div key={d.id} className="mb-4 last:mb-0">
            <div className="flex justify-between text-sm">
              <span>{d.name}{d.location && <span className="text-ink/50"> at {d.location}</span>}</span>
              <span className={d.online ? 'font-medium text-paddy' : 'text-ink/50'}>{d.online ? 'Online' : 'Offline'}</span>
            </div>
            <div className="my-1 h-3 rounded bg-steel">
              <div className={`h-3 rounded ${low ? 'bg-reject' : 'bg-grain'}`} style={{ width: `${pct}%` }} />
            </div>
            <p className={`text-sm ${low ? 'font-medium text-reject' : 'text-ink/60'}`}>
              {(d.rice_stock_grams / 1000).toFixed(2)} kg left{low && '. Refill soon.'}
            </p>
            <RefillControl device={d} onDone={onDone} />
          </div>
        );
      })}
    </section>
  );
}
