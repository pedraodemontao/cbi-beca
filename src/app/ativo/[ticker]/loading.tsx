export default function AtivoLoading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-5 pb-28 pt-8">
      <div className="h-5 w-40 animate-pulse rounded-full bg-surface" />
      <div className="h-40 animate-pulse rounded-card bg-surface" />
      <div className="h-56 animate-pulse rounded-card bg-surface" />
      <div className="h-72 animate-pulse rounded-card bg-surface" />
    </main>
  );
}
