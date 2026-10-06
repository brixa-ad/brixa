/** While a page is being put together: its shape at once, instead of the old page staying put. */
export default function Loading() {
  const block = "animate-pulse rounded-2xl bg-raised/70";
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <div className="space-y-2">
        <div className={`${block} h-7 w-56 rounded-lg`} />
        <div className={`${block} h-4 w-80 max-w-full rounded-md`} />
      </div>
      <div className={`${block} h-11 w-full rounded-xl`} />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-3xl border border-line bg-surface">
            <div className="h-40 animate-pulse bg-raised/70" />
            <div className="space-y-2 p-4">
              <div className={`${block} h-5 w-32 rounded-md`} />
              <div className={`${block} h-4 w-48 rounded-md`} />
              <div className={`${block} h-4 w-24 rounded-md`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
