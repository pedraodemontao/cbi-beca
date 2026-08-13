export default function RadarLoading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-5 pb-28 pt-8">
      <div className="h-14 w-64 animate-pulse rounded-panel bg-surface" />
      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr] lg:items-start">
        <div className="h-80 animate-pulse rounded-card bg-surface" />
        <div className="h-80 animate-pulse rounded-card bg-surface" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-panel bg-surface"
          />
        ))}
      </div>
    </main>
  );
}
