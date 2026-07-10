export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, FileText, LifeBuoy, Lock, ShieldCheck, Video } from "lucide-react";
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
    <>
      {/* МОБАЙЛ — 1-в-1 по mockup practitioner-more-ethics */}
      <div className="pcab-screen md:hidden" data-pcab-top data-testid="practitioner-ethics-mobile">
        <div className="pcab-topbar">
          <Link href={appUrl("/practitioner/more")} className="pcab-roundbtn" aria-label="Назад">
            <ChevronLeft width={19} height={19} aria-hidden="true" />
          </Link>
          <span className="pcab-topbar-title">Этика и безопасность</span>
          <span className="pcab-topbar-spacer" />
        </div>

        <section className="pcab-section">
          <div className="pcab-section-head"><span className="pcab-eyebrow">Профессиональная этика</span></div>
          <div className="pcab-list">
            <Link href={appUrl("/practitioner/ethics/code")} className="pcab-row" data-testid="ethics-code-row-mobile">
              <span className="pcab-row-ic sage"><FileText size={18} aria-hidden="true" /></span>
              <span className="pcab-row-main">
                <span className="pcab-row-t">Этический кодекс</span>
                <span className="pcab-row-s">Принят при регистрации · доступен для чтения</span>
              </span>
              <ChevronRight className="pcab-chev" size={18} aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section className="pcab-section">
          <div className="pcab-section-head"><span className="pcab-eyebrow">Запись и данные</span></div>
          <div className="pcab-list">
            <div className="pcab-row">
              <span className="pcab-row-ic calm"><Video size={18} aria-hidden="true" /></span>
              <span className="pcab-row-main">
                <span className="pcab-row-t">Запись сессий</span>
                <span className="pcab-row-s">Идёт на всех сессиях · клиент видит «идёт запись»</span>
              </span>
              <span className="pcab-okchip" style={{ marginLeft: 0 }}>включено</span>
            </div>
            <div className="pcab-row">
              <span className="pcab-row-ic sage"><ShieldCheck size={18} aria-hidden="true" /></span>
              <span className="pcab-row-main">
                <span className="pcab-row-t">Согласие клиента на запись</span>
                <span className="pcab-row-s">Клиент подтверждает при бронировании</span>
              </span>
              <span className="pcab-okchip" style={{ marginLeft: 0 }}>авто</span>
            </div>
            <a href={mainUrl("/legal/consent")} target="_blank" rel="noreferrer" className="pcab-row">
              <span className="pcab-row-ic calm"><Lock size={18} aria-hidden="true" /></span>
              <span className="pcab-row-main">
                <span className="pcab-row-t">Конфиденциальность</span>
                <span className="pcab-row-s">152-ФЗ · хранение по тарифу, затем удаление</span>
              </span>
              <ChevronRight className="pcab-chev" size={18} aria-hidden="true" />
            </a>
          </div>
        </section>

        <section className="pcab-section">
          <div className="pcab-section-head"><span className="pcab-eyebrow">Безопасность клиента</span></div>
          <div className="pcab-list">
            <Link href={appUrl("/practitioner/crisis")} className="pcab-row" data-testid="ethics-crisis-row-mobile">
              <span className="pcab-row-ic warm"><AlertTriangle size={18} aria-hidden="true" /></span>
              <span className="pcab-row-main">
                <span className="pcab-row-t">Кризис-протокол</span>
                <span className="pcab-row-s">Что делать при риске для жизни · контакты помощи</span>
              </span>
              <ChevronRight className="pcab-chev" size={18} aria-hidden="true" />
            </Link>
          </div>
          <div className="pcab-note" style={{ marginTop: 10 }}>
            <b>Платформа — не для экстренной помощи.</b> При остром риске направляйте клиента в неотложные службы;
            кризис-протокол всегда под рукой во время сессии.
          </div>
        </section>
      </div>

      {/* ДЕСКТОП — прежний вид (ждёт новых десктоп-макетов R9-5) */}
      <div className="mx-auto hidden w-full max-w-2xl px-4 py-8 sm:px-6 md:block" style={{ paddingBottom: 80 }} data-testid="practitioner-ethics-page">
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
    </>
  );
}
