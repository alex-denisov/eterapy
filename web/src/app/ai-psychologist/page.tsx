import Link from "next/link";
import { ArrowRight, Check, Clock3, Compass, MessageCircle, ShieldCheck, UserRoundCheck, X } from "lucide-react";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";

export const metadata = createPublicPageMetadata("/ai-psychologist");

const SCENARIOS = [
  "Не понимаю, почему человек отдалился",
  "Боюсь принять решение и ошибиться",
  "Зациклился на разговоре или переписке",
  "Хочу спокойно сформулировать, что со мной происходит",
];

const STEPS = [
  {
    icon: MessageCircle,
    title: "Опишите ситуацию",
    text: "Пишите как получается. Не нужно выбирать диагноз, категорию или правильные слова.",
  },
  {
    icon: Compass,
    title: "Ответьте на уточнения",
    text: "Короткий диалог отделит факты от предположений и поможет понять, какой ответ вам нужен.",
  },
  {
    icon: Check,
    title: "Получите первый шаг",
    text: "В конце будет краткий разбор, главная развилка и один безопасный шаг, который можно проверить.",
  },
];

const FAQS = [
  {
    question: "ИИ-психолог ETerapy действительно бесплатный?",
    answer: "Первичный разбор бесплатный, без банковской карты. После него можно остановиться или по своему выбору открыть платное углубление.",
  },
  {
    question: "Нужно ли регистрироваться?",
    answer: "Нет, чтобы начать диалог и получить первичный разбор, регистрация не нужна. Аккаунт понадобится только если вы захотите сохранить результат в личной карте.",
  },
  {
    question: "Это заменяет консультацию психолога?",
    answer: "Нет. ETerapy помогает структурировать жизненный вопрос, но не ставит диагнозы, не проводит психотерапию и не берёт на себя профессиональную ответственность психолога.",
  },
  {
    question: "Можно ли обратиться анонимно?",
    answer: "Начать можно без имени и публичного профиля. Не отправляйте чужие персональные данные, точные адреса, документы и другую информацию, по которой можно идентифицировать человека.",
  },
  {
    question: "Что делать, если мне угрожает опасность?",
    answer: "Цифровой сервис не подходит для срочной помощи. Если есть риск для жизни или безопасности, в России звоните 112 или обратитесь к человеку, который может быть рядом прямо сейчас.",
  },
  // B550: четыре формулировки с замеренным спросом, которых здесь не было
  // (Wordstat 2026-08-12): «ии психолог нейросеть» 1 002, «психолог онлайн
  // сейчас» 1 073, «промт для ии психолога» 558, «лучший ии психолог» и
  // «ии психолог отзывы» 617. Последняя отвечает КРИТЕРИЯМИ сравнения, а не
  // утверждением о собственном превосходстве: отзывов и рейтингов у нас нет,
  // и выдумывать их нельзя.
  {
    question: "Это нейросеть или живой психолог?",
    answer: "Разбор ведёт нейросеть, и мы не выдаём её за человека: у ответов нет автора-специалиста, диагноза и терапии. Живой специалист на платформе — отдельный формат, он обозначен явно.",
  },
  {
    question: "Можно ли обратиться ночью или прямо сейчас?",
    answer: "Да, разбор доступен в любое время и без записи. Дежурства живых специалистов круглосуточно нет, и для неотложной помощи сервис не предназначен: в России это 112.",
  },
  {
    question: "Чем это отличается от того, чтобы спросить у обычной нейросети?",
    answer: "Универсальная модель отвечает ровно на то, как вы сформулировали вопрос, — а сформулировать его и есть самое трудное. Здесь сначала идут уточняющие вопросы, потом структура ситуации и один следующий шаг, и отдельно обозначена граница, где нужен человек.",
  },
  {
    question: "Как выбрать между разными ИИ-психологами?",
    answer: "Смотрите на три вещи: сказано ли прямо, что отвечает нейросеть, а не специалист; обозначена ли граница, где нужен человек, и что происходит в кризисной ситуации; что берут за деньги и видна ли цена до начала разговора. Рейтингов и отзывов мы не публикуем — их пришлось бы придумать.",
  },
];

export default function AiPsychologistPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <main className="soft-clarity-page soft-public-page" data-testid="ai-psychologist-page">
      <PublicJsonLd route="/ai-psychologist" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, "\\u003c") }}
      />

      <section className="soft-shell py-12 md:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,.72fr)]">
          <div>
            <p className="soft-eyebrow">анонимный чат · первый разбор бесплатно</p>
            <h1 className="soft-display mt-4">
              ИИ-психолог онлайн, чтобы <span className="soft-italic">разобраться в ситуации</span>
            </h1>
            <p className="soft-lede mt-6 max-w-2xl">
              «ИИ-психолог» так обычно называют такой формат в поиске. По сути ETerapy не изображает врача:
              диалог помогает распутать мысли, отделить факты от версий и выбрать следующий шаг.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/checkin?from=ai-psychologist"
                className="soft-button soft-button-primary"
                data-analytics-event="ai_psychologist_started"
                data-analytics-target="/checkin"
                data-testid="ai-psychologist-primary-cta"
              >
                Написать свой вопрос
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <span className="text-xs text-[var(--soft-ink-faint)]">Без карты · без обязательной регистрации · около 3 минут</span>
            </div>
          </div>

          <aside className="soft-card p-6 md:p-8" aria-label="Примеры вопросов">
            <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">можно начать с одной фразы</p>
            <div className="mt-5 space-y-3">
              {SCENARIOS.map((scenario) => (
                <div key={scenario} className="rounded-2xl bg-[var(--soft-paper-deep)] px-4 py-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                  «{scenario}»
                </div>
              ))}
            </div>
            <Link href="/library" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--soft-bordeaux)] underline underline-offset-4">
              Посмотреть похожие вопросы
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </aside>
        </div>
      </section>

      <section className="soft-shell pb-16 md:pb-24" aria-labelledby="ai-psychologist-how">
        <div className="border-y border-[var(--soft-paper-edge)] py-12 md:py-16">
          <p className="soft-eyebrow">как проходит диалог</p>
          <h2 id="ai-psychologist-how" className="soft-h2 mt-3">Не совет с потолка, а <span className="soft-italic">понятная последовательность</span></h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <article key={step.title} className="soft-card p-6">
                  <Icon className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                  <h3 className="soft-h3 mt-4">{step.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{step.text}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="soft-shell pb-16 md:pb-24">
        <div className="grid gap-5 lg:grid-cols-2">
          <article className="soft-card p-6 md:p-8">
            <div className="flex items-center gap-3">
              <Clock3 className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
              <h2 className="soft-h2">Когда формат подходит</h2>
            </div>
            <ul className="mt-6 space-y-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              {[
                "Нужно выговориться письменно и увидеть вопрос яснее.",
                "Хочется проверить тревожную версию, прежде чем действовать.",
                "Нужен небольшой обратимый шаг, а не готовое решение за вас.",
                "Важно начать прямо сейчас и без публичного профиля.",
              ].map((item) => (
                <li key={item} className="flex gap-3"><Check className="mt-0.5 size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" /><span>{item}</span></li>
              ))}
            </ul>
          </article>

          <article className="soft-card bg-[var(--soft-bordeaux)] p-6 text-[var(--soft-paper)] md:p-8">
            <div className="flex items-center gap-3">
              <ShieldCheck className="size-5 text-[var(--soft-gold)]" aria-hidden="true" />
              <h2 className="text-2xl font-medium text-[var(--soft-paper)]" style={{ fontFamily: "var(--font-heading)" }}>Когда нужен человек</h2>
            </div>
            <ul className="mt-6 space-y-4 text-sm leading-relaxed text-[#e8c4b8]">
              {[
                "Нужны диагноз, лечение, психотерапия или длительная поддержка.",
                "Есть насилие, угроза безопасности или риск для жизни.",
                "Ситуация требует медицинской, юридической или финансовой ответственности.",
                "Одна и та же тема возвращается и самостоятельные шаги не помогают.",
              ].map((item) => (
                <li key={item} className="flex gap-3"><X className="mt-0.5 size-4 shrink-0 text-[var(--soft-gold)]" aria-hidden="true" /><span>{item}</span></li>
              ))}
            </ul>
            <Link href="/practitioners" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--soft-gold)] underline underline-offset-4">
              Посмотреть специалистов
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </article>
        </div>
      </section>

      <section className="soft-shell pb-16 md:pb-24" aria-labelledby="ai-psychologist-trust">
        <div className="soft-card p-6 md:p-8">
          <div className="grid gap-8 md:grid-cols-[auto_1fr]">
            <UserRoundCheck className="size-8 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
            <div>
              <p className="soft-eyebrow">кто отвечает за содержание</p>
              <h2 id="ai-psychologist-trust" className="soft-h2 mt-3">Редакция ETerapy, без выдуманного эксперта</h2>
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                За продуктовые определения, ограничения, источники и обновления отвечает организация ETerapy.
                Мы не приписываем материалам несуществующие дипломы и не выдаём автоматический ответ за консультацию психолога.
              </p>
              <div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold text-[var(--soft-bordeaux)]">
                <Link href="/editorial-policy" className="underline underline-offset-4">Редакционная политика</Link>
                <Link href="/legal/privacy" className="underline underline-offset-4">Конфиденциальность</Link>
                <Link href="/how-it-works" className="underline underline-offset-4">Как работает ETerapy</Link>
                {/* B657: обратные ссылки — страница должна не только получать
                    вес, но и вести дальше по сайту. */}
                <Link href="/library" className="underline underline-offset-4">Библиотека разборов</Link>
                <Link href="/practitioners" className="underline underline-offset-4">Живые специалисты</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="soft-shell pb-16 md:pb-24" aria-labelledby="ai-psychologist-faq">
        <p className="soft-eyebrow">частые вопросы</p>
        <h2 id="ai-psychologist-faq" className="soft-h2 mt-3">Перед первым сообщением</h2>
        <div className="mt-6 divide-y divide-[var(--soft-paper-edge)] border-y border-[var(--soft-paper-edge)]">
          {FAQS.map((item) => (
            <details key={item.question} className="group py-5">
              <summary className="cursor-pointer list-none pr-8 text-base font-semibold text-[var(--soft-ink)] marker:hidden">{item.question}</summary>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">{item.answer}</p>
            </details>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link href="/checkin?from=ai-psychologist-bottom" className="soft-button soft-button-primary">
            Начать бесплатный разбор
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </main>
  );
}
