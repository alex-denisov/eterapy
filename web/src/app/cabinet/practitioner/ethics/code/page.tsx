export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { appUrl } from "@/lib/subdomain";

// B466 — «Этический кодекс» (mockup -more-ethics-code): полный документ,
// открываемый повторно (owner review #3).

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
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6" style={{ paddingBottom: 80 }} data-testid="practitioner-ethics-code-page">
      <Link href={appUrl("/practitioner/ethics")} className="inline-flex items-center gap-1.5 text-sm text-[var(--soft-ink-soft)]">
        <ArrowLeft className="h-4 w-4" />
        Этика и безопасность
      </Link>
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
  );
}
