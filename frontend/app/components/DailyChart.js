export default function DailyChart({ daily }) {
  const max = Math.max(1, ...daily.map((d) => d.count));
  return (
    <section className="rounded-lg bg-white p-6">
      <h2 className="mb-4 text-xl font-semibold">Items per day</h2>
      {daily.length === 0 ? (
        <p className="text-sm text-ink/60">No activity in this range.</p>
      ) : (
        <div className="flex gap-2">
          {daily.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-28 w-full items-end">
                <div
                  role="img"
                  aria-label={`${d.day}: ${d.count} items`}
                  className="w-full rounded-t bg-paddy"
                  style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }}
                />
              </div>
              <span className="text-xs text-ink/60">{d.day.slice(5)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
