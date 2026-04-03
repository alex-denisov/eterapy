import Link from "next/link";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <nav className="mb-6 flex flex-wrap gap-3 text-sm text-muted-foreground">
        <Link href="/legal/offer" className="hover:text-foreground">Оферта</Link>
        <span>·</span>
        <Link href="/legal/privacy" className="hover:text-foreground">Политика конфиденциальности</Link>
        <span>·</span>
        <Link href="/legal/ethics" className="hover:text-foreground">Этический кодекс</Link>
        <span>·</span>
        <Link href="/about" className="hover:text-foreground">О проекте</Link>
      </nav>
      {children}
    </div>
  );
}
