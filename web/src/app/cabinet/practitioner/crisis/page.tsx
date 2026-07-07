export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Phone } from "lucide-react";
import { auth } from "@/lib/auth";
import { appUrl } from "@/lib/subdomain";

// B466 — «Кризис-протокол» (mockup -more-crisis): признаки острого риска,
// шаги практика и экстренные контакты (owner review #3).

const RISK_SIGNS = [
  "Прямые или косвенные высказывания о нежелании жить",
  "Планы причинить вред себе или другим",
  "Признаки острого психотического состояния",
  "Сообщения о насилии, происходящем прямо сейчас",
];

const STEPS = [
  "Сохраняйте спокойный контакт — не оставляйте клиента одного в разговоре.",
  "Прямо спросите о безопасности: «Есть ли у вас мысли причинить себе вред?»",
  "Передайте контакты экстренной помощи (ниже) и предложите позвонить вместе.",
  "Не берите на себя роль экстренной службы — ваша задача соединить с ней.",
  "После сессии сообщите платформе через поддержку — мы подключим протокол сопровождения.",
];

export default async function PractitionerCrisisPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6" style={{ paddingBottom: 80 }} data-testid="practitioner-crisis-page">
      <Link href={appUrl("/practitioner/ethics")} className="inline-flex items-center gap-1.5 text-sm text-[var(--soft-ink-soft)]">
        <ArrowLeft className="h-4 w-4" />
        Этика и безопасность
      </Link>
      <p className="soft-eyebrow mt-4">Протокол</p>
      <h1 className="soft-h1 mt-2">Кризис-протокол</h1>

      {/* Экстренно */}
      <section
        className="mt-5 rounded-[18px] border-2 p-4"
        style={{ borderColor: "var(--soft-terracotta)", background: "var(--soft-paper-card)" }}
        data-testid="crisis-emergency"
      >
        <p className="text-sm font-semibold">Угроза жизни прямо сейчас</p>
        <a href="tel:112" className="soft-button soft-button-primary mt-3 inline-flex">
          <Phone className="size-4" aria-hidden="true" />
          Позвонить 112
        </a>
      </section>

      {/* Признаки риска */}
      <section className="soft-card mt-4 p-4 sm:p-5">
        <p className="soft-eyebrow">Признаки острого риска</p>
        <ul className="mt-2.5 space-y-2.5 text-sm text-[var(--soft-ink-soft)]">
          {RISK_SIGNS.map((sign) => (
            <li key={sign} className="flex items-start gap-3">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--soft-terracotta)" }} />
              {sign}
            </li>
          ))}
        </ul>
      </section>

      {/* Шаги */}
      <section className="soft-card mt-4 p-4 sm:p-5">
        <p className="soft-eyebrow">Шаги практика</p>
        <ol className="mt-2.5 space-y-3 text-sm text-[var(--soft-ink-soft)]">
          {STEPS.map((step, index) => (
            <li key={step} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--soft-paper-deep)] text-xs font-semibold text-[var(--soft-bordeaux)]">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      {/* Контакты */}
      <section className="soft-card mt-4 p-4 sm:p-5" data-testid="crisis-contacts">
        <p className="soft-eyebrow">Экстренные контакты</p>
        <dl className="mt-2.5 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[var(--soft-ink-soft)]">Экстренные службы</dt>
            <dd><a href="tel:112" className="font-semibold text-[var(--soft-bordeaux)]">112</a></dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[var(--soft-ink-soft)]">Телефон доверия (круглосуточно)</dt>
            <dd><a href="tel:88002000122" className="font-semibold text-[var(--soft-bordeaux)]">8-800-2000-122</a></dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[var(--soft-ink-soft)]">Поддержка платформы</dt>
            <dd>
              <Link href={appUrl("/support")} className="font-semibold text-[var(--soft-terracotta-dark)]">
                написать →
              </Link>
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
