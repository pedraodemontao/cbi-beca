export default function ProventosLoading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-5 pb-28 pt-8">
      <div className="h-14 w-52 animate-pulse rounded-panel bg-surface" />
      <div className="h-56 animate-pulse rounded-card bg-surface" />
      <div className="h-64 animate-pulse rounded-card bg-surface" />
      <div className="h-48 animate-pulse rounded-card bg-surface" />
    </main>
  );
}
