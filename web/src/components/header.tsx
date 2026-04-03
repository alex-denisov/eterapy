import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-navy/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-heading text-xl font-bold text-primary">
            ETerapy
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <Link
            href="#how-it-works"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Как это работает
          </Link>
          <Link
            href="#for-practitioners"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Для практиков
          </Link>
          <Link
            href="#ai-tools"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            AI-инструменты
          </Link>
          <Link
            href="#faq"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            FAQ
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            Войти
          </Button>
          <Button size="sm">Начать бесплатно</Button>
        </div>
      </div>
    </header>
  );
}
