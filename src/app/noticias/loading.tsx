export default function NoticiasLoading() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 pb-28 pt-8">
      <div className="h-14 w-64 animate-pulse rounded-panel bg-surface" />
      <div className="flex gap-2">
        <div className="h-10 w-24 animate-pulse rounded-full bg-surface" />
        <div className="h-10 w-32 animate-pulse rounded-full bg-surface" />
      </div>
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3, 4].map((index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-panel bg-surface"
          />
        ))}
      </div>
    </main>
  );
}
