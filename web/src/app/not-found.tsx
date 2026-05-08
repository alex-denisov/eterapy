import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-4 text-center bg-[var(--paper)]">
      <div className="bg-[var(--paper-card)] border border-[var(--paper-edge)] rounded-[var(--r-lg)] p-12 shadow-[var(--shadow-lg)] max-w-lg">
        <p className="font-[var(--serif)] text-8xl font-bold text-[var(--bordeaux)]/20">404</p>
        <h1 className="mt-4 font-[var(--serif)] text-3xl font-bold text-[var(--bordeaux)]">
          Страница не найдена
        </h1>
        <p className="mt-3 text-[var(--ink-soft)] text-lg leading-relaxed">
          Возможно, она была удалена или вы перешли по неверной ссылке.
        </p>
        <div className="mt-10 flex flex-wrap gap-4 justify-center">
          <Link href="/" className="bg-[var(--terracotta)] text-[var(--paper)] px-6 py-3 rounded-full text-sm font-semibold hover:bg-[var(--terracotta-d)] transition-colors shadow-[0_8px_22px_-10px_rgba(214,117,88,0.7),_inset_0_-2px_0_rgba(0,0,0,0.08)]">
            На главную
          </Link>
          <Link href="/checkin" className="border border-[var(--paper-edge)] bg-[var(--paper-card)] text-[var(--ink-soft)] px-6 py-3 rounded-full text-sm font-semibold hover:border-[var(--terracotta)] hover:text-[var(--bordeaux)] transition-colors">
            Задать вопрос
          </Link>
        </div>
      </div>
    </div>
  );
}
