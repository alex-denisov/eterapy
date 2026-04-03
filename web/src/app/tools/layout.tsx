import Link from "next/link";

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Панель навигации для инструментов */}
      <div className="border-b border-border/30 bg-navy/50">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5">
          <Link
            href="/tools"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Все инструменты
          </Link>
        </div>
      </div>
      {children}
    </>
  );
}
