export default function Stats({ totals }) {
  return (
    <section className="grid gap-4 sm:grid-cols-3">
      <Card label="Items detected" value={totals.total} />
      <Card label="Recyclable" value={totals.recyclable} />
      <Card label="Rice released" value={`${(totals.rice_grams / 1000).toFixed(2)} kg`} accent />
    </section>
  );
}

function Card({ label, value, accent }) {
  return (
    <div className={`rounded-lg p-5 ${accent ? 'bg-paddy text-white' : 'bg-white'}`}>
      <p className={`text-sm ${accent ? 'text-white/70' : 'text-ink/60'}`}>{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
    </div>
  );
}
