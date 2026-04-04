export function ToolLoading({ message = "Готовим ответ..." }: { message?: string }) {
  return (
    <div className="mt-12 flex flex-col items-center gap-4 text-center">
      <div className="relative">
        <span className="animate-ping absolute inline-flex h-8 w-8 rounded-full bg-primary/30" />
        <span className="relative inline-flex h-8 w-8 items-center justify-center text-2xl text-primary">✦</span>
      </div>
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}
