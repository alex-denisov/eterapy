export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, MessageSquare, Phone } from "lucide-react";
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
    <>
      {/* МОБАЙЛ — 1-в-1 по mockup practitioner-more-crisis */}
      <div className="pcab-screen md:hidden" data-pcab-top data-testid="practitioner-crisis-mobile">
        <div className="pcab-topbar">
          <Link href={appUrl("/practitioner/ethics")} className="pcab-roundbtn" aria-label="Назад">
            <ChevronLeft width={19} height={19} aria-hidden="true" />
          </Link>
          <span className="pcab-topbar-title">Кризис-протокол</span>
          <span className="pcab-topbar-spacer" />
        </div>

        <a href="tel:112" className="pcab-call" data-testid="crisis-call-mobile">
          <span className="pcab-call-ic"><Phone size={22} strokeWidth={1.9} aria-hidden="true" /></span>
          <span className="pcab-call-main">
            <span className="pcab-call-t">Позвонить 112</span>
            <span className="pcab-call-s">Единая служба экстренной помощи</span>
          </span>
          <ChevronRight size={20} aria-hidden="true" />
        </a>

        <div className="pcab-flabel">Признаки острого риска</div>
        <ul className="pcab-signs">
          {RISK_SIGNS.map((sign) => (
            <li key={sign} className="pcab-sign">{sign}</li>
          ))}
        </ul>

        <div className="pcab-flabel">Ваши шаги</div>
        <div className="pcab-steps">
          {STEPS.map((step, index) => (
            <div key={step} className="pcab-step">
              <span className="pcab-step-n">{index + 1}</span>
              <span className="pcab-step-t">{step}</span>
            </div>
          ))}
        </div>

        <div className="pcab-flabel">Экстренные контакты</div>
        <div className="pcab-list">
          <a href="tel:112" className="pcab-row">
            <span className="pcab-row-ic warm"><Phone size={18} aria-hidden="true" /></span>
            <span className="pcab-row-main">
              <span className="pcab-row-t">Экстренные службы</span>
              <span className="pcab-row-s">Скорая, полиция, МЧС</span>
            </span>
            <span className="pcab-contact-num">112</span>
          </a>
          <a href="tel:88002000122" className="pcab-row">
            <span className="pcab-row-ic calm"><MessageSquare size={18} aria-hidden="true" /></span>
            <span className="pcab-row-main">
              <span className="pcab-row-t">Телефон доверия</span>
              <span className="pcab-row-s">Психологическая помощь · круглосуточно</span>
            </span>
            <span className="pcab-contact-num">8-800-2000-122</span>
          </a>
          <Link href={appUrl("/support")} className="pcab-row">
            <span className="pcab-row-ic calm"><MessageSquare size={18} aria-hidden="true" /></span>
            <span className="pcab-row-main">
              <span className="pcab-row-t">Поддержка платформы</span>
              <span className="pcab-row-s">Сигнал безопасности · сопровождение</span>
            </span>
            <ChevronRight className="pcab-chev" size={18} aria-hidden="true" />
          </Link>
        </div>

        <div className="pcab-note" style={{ marginTop: 16 }}>
          <b>Платформа не заменяет экстренную помощь.</b> При угрозе жизни приоритет — неотложные службы; протокол
          всегда доступен во время сессии.
        </div>
      </div>

      {/* ДЕСКТОП — прежний вид (ждёт новых десктоп-макетов R9-5) */}
      <div className="mx-auto hidden w-full max-w-2xl px-4 py-8 sm:px-6 md:block" style={{ paddingBottom: 80 }} data-testid="practitioner-crisis-page">
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
    </>
  );
}
