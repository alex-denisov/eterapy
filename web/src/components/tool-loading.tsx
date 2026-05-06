import { HaloMark } from "@/components/brand/brand-mark";

export function ToolLoading({ message = "Готовим ответ..." }: { message?: string }) {
  return (
    <div className="mt-12 flex flex-col items-center gap-4 text-center">
      <HaloMark size={52} glow className="[animation:softHaloBreathe_5s_ease-in-out_infinite]" />
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}
