export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronRight, FileText, LifeBuoy, Lock, Video } from "lucide-react";
import { auth } from "@/lib/auth";
import { appUrl, mainUrl } from "@/lib/subdomain";

// B466 — «Этика и безопасность» (mockup -more-ethics, owner review #3: у
// кнопок нижнего уровня есть свои экраны): кодекс → /ethics/code, кризис-
// протокол → /practitioner/crisis + информация о записи и 152-ФЗ.

export default async function PractitionerEthicsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6" style={{ paddingBottom: 80 }} data-testid="practitioner-ethics-page">
      <Link href={appUrl("/practitioner/more")} className="inline-flex items-center gap-1.5 text-sm text-[var(--soft-ink-soft)]">
        <ArrowLeft className="h-4 w-4" />
        Ещё
      </Link>
      <p className="soft-eyebrow mt-4">Кабинет практика</p>
      <h1 className="soft-h1 mt-2">Этика и безопасность</h1>

      {/* Документы-строки */}
      <section className="mt-5 divide-y divide-[var(--soft-paper-deep)] overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]">
        <Link href={appUrl("/practitioner/ethics/code")} className="flex items-center gap-3 px-3.5 py-3.5 transition-colors hover:bg-[var(--soft-paper-deep)]/40" data-testid="ethics-code-row">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[var(--soft-paper-deep)] text-[var(--soft-ink-soft)]">
            <FileText className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium">Этический кодекс</span>
            <span className="mt-0.5 block text-xs text-[var(--soft-ink-faint)]">принят при регистрации · доступен для повторного чтения</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--soft-ink-faint)]" />
        </Link>
        <Link href={appUrl("/practitioner/crisis")} className="flex items-center gap-3 px-3.5 py-3.5 transition-colors hover:bg-[var(--soft-paper-deep)]/40" data-testid="ethics-crisis-row">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]" style={{ background: "#F6E7DD", color: "var(--soft-terracotta-dark)" }}>
            <LifeBuoy className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium">Кризис-протокол</span>
            <span className="mt-0.5 block text-xs text-[var(--soft-ink-faint)]">что делать при признаках острого риска у клиента</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--soft-ink-faint)]" />
        </Link>
      </section>

      {/* Запись и согласие */}
      <section className="soft-card mt-4 p-4 sm:p-5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Video className="h-4 w-4 text-[var(--soft-terracotta-dark)]" />
          Запись и согласие
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Каждая видеосессия идёт с записью и расшифровкой (server-STT) — обе стороны дают согласие перед началом.
          Запись служит безопасности и AI-разбору; аудио удаляется после обработки.
        </p>
      </section>

      {/* Конфиденциальность */}
      <section className="soft-card mt-4 p-4 sm:p-5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Lock className="h-4 w-4 text-[var(--soft-ink-soft)]" />
          Конфиденциальность · 152-ФЗ
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Транскрипты и материалы сессий хранятся ограниченный срок по вашему тарифу и не передаются третьим лицам.
          Полные условия — в{" "}
          <a href={mainUrl("/legal/consent")} target="_blank" rel="noreferrer" className="text-[var(--soft-terracotta-dark)] underline-offset-2 hover:underline">
            согласии на обработку данных
          </a>.
        </p>
      </section>
    </div>
  );
}
