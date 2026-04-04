export default function Loading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <span className="animate-pulse text-3xl text-primary">✦</span>
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      </div>
    </div>
  );
}
