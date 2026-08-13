export default function CompararLoading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-5 pb-28 pt-8">
      <div className="h-14 w-72 animate-pulse rounded-panel bg-surface" />
      <div className="h-40 animate-pulse rounded-card bg-surface" />
      <div className="h-80 animate-pulse rounded-card bg-surface" />
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1].map((index) => (
          <div key={index} className="h-52 animate-pulse rounded-panel bg-surface" />
        ))}
      </div>
    </main>
  );
}
