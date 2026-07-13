export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { appUrl } from "@/lib/subdomain";

// B466 — «Этический кодекс» (mockup -more-ethics-code): полный документ,
// открываемый повторно (owner review #3). Мобайл 1-в-1 по макету, но БЕЗ
// кнопки «Скачать» (owner R9: без встроенного вьюера/скачивания PDF) — топбар
// закрыт spacer'ом. Контент — канонические принципы (не выдуманные пункты).

const PRINCIPLES = [
  "Не давать ложных обещаний результата и не манипулировать страхами клиента.",
  "Не принимать оплату за пределами платформы ETerapy.",
  "Сохранять конфиденциальность клиентских сессий.",
  "Не работать в областях, выходящих за рамки своей квалификации — направлять к коллегам.",
  "Уважать отказ клиента продолжать работу без давления.",
  "Сообщать платформе о ситуациях, требующих экстренной помощи.",
  "Не выдавать услуги платформы за медицинскую помощь и не ставить диагнозы.",
];

export default async function PractitionerEthicsCodePage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  return (
    <>
      {/* МОБАЙЛ — 1-в-1 по mockup practitioner-more-ethics-code (без «Скачать» — owner R9) */}
      <div className="pcab-screen md:hidden" data-pcab-top data-testid="practitioner-ethics-code-mobile">
        <div className="pcab-topbar">
          <Link href={appUrl("/practitioner/ethics")} className="pcab-roundbtn" aria-label="Назад">
            <ChevronLeft width={19} height={19} aria-hidden="true" />
          </Link>
          <span className="pcab-topbar-title">Документ</span>
          <span className="pcab-topbar-spacer" />
        </div>

        <div className="pcab-doc-head">
          <div className="pcab-doc-title">Этический кодекс</div>
          <div className="pcab-doc-meta">Для специалистов ETerapy · принят при регистрации</div>
        </div>

        <div className="pcab-doc-body">
          {PRINCIPLES.map((rule, i) => (
            <div key={rule} className="pcab-clause">
              <span className="pcab-clause-n">{i + 1}</span>
              <span className="pcab-clause-t">{rule}</span>
            </div>
          ))}
        </div>

        <div className="pcab-summary" style={{ marginTop: 14 }}>
          <span className="pcab-summary-ic">
            <CheckCircle2 size={20} aria-hidden="true" />
          </span>
          <span className="pcab-summary-main">
            <span className="pcab-summary-t">Вы приняли кодекс</span>
            <span className="pcab-summary-s">Согласие подтверждено при регистрации · нарушения ведут к приостановке профиля.</span>
          </span>
        </div>
      </div>

      {/* ДЕСКТОП R9-5 — 1-в-1 practitioner-desktop-ethics-code-v2 (хлебные крошки
          от «Этика и безопасность» + документ с 7 каноническими принципами). */}
      <div className="mx-auto hidden w-full max-w-3xl px-4 py-8 sm:px-6 md:block" style={{ paddingBottom: 80 }} data-testid="practitioner-ethics-code-page">
        <nav className="flex items-center gap-1.5 text-xs text-[var(--soft-ink-faint)]" aria-label="Хлебные крошки">
          <Link href={appUrl("/practitioner/ethics")} className="transition-colors hover:text-[var(--soft-ink-soft)]">Этика и безопасность</Link>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <span className="text-[var(--soft-ink-soft)]">Этический кодекс</span>
        </nav>
        <p className="soft-eyebrow mt-4">Документ</p>
        <h1 className="soft-h1 mt-2">Этический кодекс</h1>

        <div className="soft-card mt-5 space-y-4 p-5">
          <p className="font-semibold text-[var(--soft-bordeaux)]">Принципы работы специалиста ETerapy</p>
          <ul className="space-y-3 text-sm text-[var(--soft-ink-soft)]">
            {PRINCIPLES.map((rule) => (
              <li key={rule} className="flex items-start gap-3">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--soft-terracotta)]" />
                {rule}
              </li>
            ))}
          </ul>
          <p className="border-t border-[var(--soft-paper-deep)] pt-3 text-xs text-[var(--soft-ink-faint)]">
            Подписав этот кодекс при регистрации, вы подтвердили согласие со всеми его пунктами. Нарушения ведут к
            приостановке профиля.
          </p>
        </div>
      </div>
    </>
  );
}
