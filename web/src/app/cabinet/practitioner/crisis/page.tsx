export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, MessageSquare, Phone } from "lucide-react";
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

      {/* ДЕСКТОП R9-5 — 1-в-1 practitioner-desktop-crisis-v2 (хлебные крошки от
          «Этика», красный alert, «пошагово» + «Экстренные телефоны · Россия»). */}
      <div className="mx-auto hidden w-full max-w-6xl px-4 py-8 sm:px-6 md:block" style={{ paddingBottom: 80 }} data-testid="practitioner-crisis-page">
        <nav className="flex items-center gap-1.5 text-xs text-[var(--soft-ink-faint)]" aria-label="Хлебные крошки">
          <Link href={appUrl("/practitioner/ethics")} className="transition-colors hover:text-[var(--soft-ink-soft)]">Этика и безопасность</Link>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <span className="text-[var(--soft-ink-soft)]">Кризисный протокол</span>
        </nav>
        <p className="soft-eyebrow mt-4">Безопасность</p>
        <h1 className="soft-h1 mt-2">Кризисный протокол</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Если во время работы клиент говорит о мыслях о суициде, самоповреждении или прямой угрозе жизни — безопасность важнее сессии. Действуйте по шагам ниже.
        </p>

        {/* Красный alert — прямая угроза жизни */}
        <div className="mt-5 flex items-start gap-3 rounded-[16px] border p-4" style={{ background: "#F7E4E0", borderColor: "#E4B8AE", color: "#7A2E22" }} data-testid="crisis-emergency">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(122,46,34,0.12)" }}>
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold">Есть прямая угроза жизни?</p>
            <p className="mt-1 text-[13px] leading-relaxed opacity-90">
              Немедленно порекомендуйте клиенту позвонить <a href="tel:112" className="font-semibold underline underline-offset-2">112</a> или <a href="tel:103" className="font-semibold underline underline-offset-2">103</a> и, если возможно, помогите связаться с близкими. Платформа и консультации не заменяют экстренные службы.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          {/* Что делать · пошагово */}
          <div className="soft-card p-5 sm:p-6">
            <p className="soft-eyebrow mb-4">Что делать · пошагово</p>
            <ol className="space-y-4">
              {STEPS.map((step, index) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold" style={{ background: "#F6E3DC", color: "var(--soft-bordeaux)" }}>
                    {index + 1}
                  </span>
                  <span className="text-[13.5px] leading-relaxed text-[var(--soft-ink-soft)]">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Экстренные телефоны + note */}
          <div className="flex flex-col gap-4">
            <div className="soft-card p-5" data-testid="crisis-contacts">
              <p className="soft-eyebrow mb-3">Экстренные телефоны · Россия</p>
              <div className="space-y-3">
                {[
                  { tel: "112", num: "112", label: "Единый номер экстренных служб" },
                  { tel: "103", num: "103", label: "Скорая медицинская помощь" },
                  { tel: "88002000122", num: "8 800 2000 122", label: "Единый телефон доверия · бесплатно, круглосуточно" },
                ].map((c) => (
                  <a key={c.tel} href={`tel:${c.tel}`} className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]" style={{ background: "#F6E3DC", color: "var(--soft-bordeaux)" }}>
                      <Phone className="h-[18px] w-[18px]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-heading text-[16px] font-semibold text-[var(--soft-bordeaux)]">{c.num}</span>
                      <span className="mt-0.5 block text-xs text-[var(--soft-ink-faint)]">{c.label}</span>
                    </span>
                  </a>
                ))}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
                Проверяйте актуальные региональные службы психологической помощи — они могут отличаться по региону клиента.
              </p>
            </div>
            <div className="rounded-[18px] p-4" style={{ background: "var(--soft-paper-deep)" }}>
              <p className="text-[12.5px] leading-relaxed text-[var(--soft-ink-faint)]">
                Платформа не предназначена для экстренной помощи и не ведёт круглосуточного дежурства. В ситуации прямой угрозы жизни всегда приоритет — государственные экстренные службы. Написать в поддержку можно в разделе{" "}
                <Link href={appUrl("/support")} className="text-[var(--soft-terracotta-dark)] underline-offset-2 hover:underline">«Помощь»</Link>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
