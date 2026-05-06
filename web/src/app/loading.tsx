import { HaloMark } from "@/components/brand/brand-mark";

export default function Loading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <HaloMark size={52} glow className="[animation:softHaloBreathe_5s_ease-in-out_infinite]" />
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      </div>
    </div>
  );
}
