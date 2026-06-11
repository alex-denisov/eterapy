import Link from "next/link";
import { notFound } from "next/navigation";
import type React from "react";
import { ArrowRight, ChevronDown, LockKeyhole } from "lucide-react";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { ChatAnalysisActions } from "@/components/products/chat-analysis-actions";
import { CompatibilityActions } from "@/components/products/compatibility-actions";
import { DeepReportActions } from "@/components/products/deep-report-actions";
import { JointSessionActions } from "@/components/products/joint-session-actions";
import { PerspectivesActions } from "@/components/products/perspectives-actions";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { SevenDaysActions } from "@/components/products/seven-days-actions";
import { SynastryActions } from "@/components/products/synastry-actions";
import { SymbolicProductActions } from "@/components/products/symbolic-product-actions";
import { createPublicPageMetadata, type PublicSeoRoute } from "@/lib/public-page-seo";
import { getV5Product, v5Products, type V5Product } from "@/lib/v5-products";

export function generateStaticParams() {
  return v5Products.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getV5Product(slug);
  if (!product) return {};
  return createPublicPageMetadata(product.route as PublicSeoRoute);
}

function ProductHero({
  product,
  search,
  side,
}: {
  product: V5Product;
  search?: { dialogueId?: string };
  side: React.ReactNode;
}) {
  const isPerspectives = product.slug === "perspectives";

  return (
    <section className="soft-shell soft-product-detail-hero" data-testid="product-hero">
      <div>
        <Link href="/" className="soft-chip" data-testid="product-hero-back">← На главную</Link>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {product.tone !== "free" && <span className="soft-badge soft-badge-lilac">{product.tone === "private" ? "приватно" : "новый формат"}</span>}
          <span className="text-xs text-[var(--soft-ink-faint)]">· {product.eyebrow}</span>
        </div>
        <h1 className="soft-h1 mt-4">{product.name}</h1>
        <p className="soft-lede mt-4 max-w-xl">{product.summary}</p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <p className="font-heading text-[2.5rem] font-semibold leading-none text-[var(--soft-bordeaux)]" data-testid="product-hero-price">
            {product.price}
          </p>
          <p className="max-w-[13rem] text-sm leading-relaxed text-[var(--soft-ink-faint)]">{product.priceMeta}</p>
          {isPerspectives ? (
            search?.dialogueId ? (
              <a href="#perspectives-actions" className="soft-button soft-button-primary" data-testid="product-hero-primary-cta">
                Получить 4 ракурса
                <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            ) : (
              <a
                href="#product-intake-perspectives"
                className="soft-button soft-button-primary"
                data-testid="product-dialogue-cta"
              >
                Начать бесплатный диалог
                <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            )
          ) : (
            <ProductPrimaryAction product={product} />
          )}
        </div>
      </div>
      <div className="soft-product-hero-preview" data-testid="product-hero-preview">
        {side}
      </div>
    </section>
  );
}

function DeepReportSide() {
  return (
    <div className="relative grid min-h-[20rem] place-items-center rounded-[1.75rem] bg-[linear-gradient(160deg,#FFFCF5,#F4D9C1)] p-10 text-center">
      <div className="relative h-80 w-60 rotate-[-2deg] rounded-lg border border-[var(--soft-paper-edge)] bg-white p-6 text-left shadow-[0_20px_50px_-15px_rgba(60,30,20,.3),0_2px_4px_rgba(60,30,20,.06)]">
        <div className="soft-eyebrow text-[0.56rem]">ETerapy · глубокий отчёт</div>
        <div className="mt-3 font-heading text-base italic leading-snug text-[var(--soft-bordeaux)]">Сепарация и собственный голос</div>
        <div className="my-3 h-px bg-[var(--soft-paper-edge)]" />
        <div className="flex flex-col gap-1 text-[0.56rem] leading-relaxed text-[var(--soft-ink-faint)]">
          {[1, 2, 3, 4, 5, 6, 7].map((item) => <div key={item}>{item}. ▬▬▬▬▬▬▬▬</div>)}
        </div>
        <div className="absolute -bottom-2 -right-2 rotate-[8deg] rounded-full bg-[var(--soft-apricot)] px-3 py-1 text-[0.63rem] font-semibold text-[var(--soft-bordeaux)]">15 стр.</div>
      </div>
    </div>
  );
}

function ExtendedMapSide() {
  return (
    <div className="relative grid min-h-[20rem] place-items-center rounded-[1.75rem] bg-[linear-gradient(160deg,#DBD3EA,#F4D9C1)] p-6 sm:p-10" data-testid="product-my-map-preview">
      <div className="relative w-full max-w-80">
        <div className="grid grid-cols-4 gap-1.5">
          {["Отношения", "Семья", "Работа", "Тело", "Деньги", "Подруги", "Мама", "Партнёр"].map((topic, index) => (
            <div key={topic} className="rounded-lg p-2 text-center text-[0.56rem] text-[var(--soft-bordeaux)]" style={{ background: ["#F4D9C1", "#E8C4B8", "#DBD3EA", "#D6DECC"][index % 4] }}>
              {topic}
            </div>
          ))}
        </div>
        <div className="absolute bottom-[-0.5rem] right-0 w-40 rotate-[-3deg] rounded-2xl border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 font-heading text-xs italic text-[var(--soft-bordeaux)] shadow-[0_8px_20px_-8px_rgba(60,30,20,.2)] sm:inset-[-0.75rem] sm:w-44 sm:translate-x-[48%] sm:translate-y-[62%]">
          «3 темы стали тише за год, 1 — окрепла»
        </div>
      </div>
    </div>
  );
}

function TarotSide() {
  return (
    <div className="grid min-h-[20rem] place-items-center rounded-[1.75rem] bg-[linear-gradient(160deg,#DBD3EA,#E8E1F2)] p-10">
      <div className="flex gap-2.5">
        {[0, 1, 2].map((item) => (
          <div key={item} className="relative h-28 w-[4.4rem] rounded-lg border-2 border-[#DBD3EA] bg-[linear-gradient(140deg,#4A3E5E,#6B5C82)] shadow-[0_8px_16px_-4px_rgba(0,0,0,.25)]" style={{ transform: `rotate(${(item - 1) * 5}deg) translateY(${Math.abs(item - 1) * -4}px)` }}>
            <div className="absolute inset-2 grid place-items-center rounded border border-[#DBD3EA]">
              <span className="font-heading text-3xl italic text-[#DBD3EA]">★</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NatalSide() {
  return (
    <div className="grid min-h-[20rem] place-items-center rounded-[1.75rem] bg-[linear-gradient(160deg,#D6DECC,#E5EBDC)] p-10">
      <svg viewBox="0 0 260 260" width="260" height="260" aria-hidden="true">
        <circle cx="130" cy="130" r="120" fill="none" stroke="#3A4A36" strokeWidth="1.5" opacity=".4" />
        <circle cx="130" cy="130" r="90" fill="none" stroke="#3A4A36" strokeWidth="1" opacity=".3" />
        <circle cx="130" cy="130" r="60" fill="none" stroke="#3A4A36" strokeWidth="1" opacity=".25" />
        {Array.from({ length: 12 }).map((_, index) => {
          const angle = (index * 30 - 90) * Math.PI / 180;
          return <line key={index} x1={130 + Math.cos(angle) * 60} y1={130 + Math.sin(angle) * 60} x2={130 + Math.cos(angle) * 120} y2={130 + Math.sin(angle) * 120} stroke="#3A4A36" strokeWidth="1" opacity=".3" />;
        })}
        {[15, 47, 92, 145, 198, 234].map((deg, index) => {
          const angle = (deg - 90) * Math.PI / 180;
          return <circle key={index} cx={130 + Math.cos(angle) * 105} cy={130 + Math.sin(angle) * 105} r="5" fill="#3A4A36" />;
        })}
        <text x="130" y="135" textAnchor="middle" fontFamily="var(--font-heading)" fontSize="14" fontStyle="italic" fill="#3A4A36">портрет</text>
      </svg>
    </div>
  );
}

function SynastrySide() {
  return (
    <div className="relative grid min-h-[20rem] place-items-center rounded-[1.75rem] bg-[linear-gradient(160deg,#D6DECC,#DBD3EA)] p-10">
      <div className="relative h-64 w-72 max-w-full">
        <svg viewBox="0 0 288 256" className="h-full w-full" aria-hidden="true">
          <circle cx="94" cy="118" r="62" fill="none" stroke="#3A4A36" strokeWidth="2" opacity=".55" />
          <circle cx="188" cy="118" r="62" fill="none" stroke="#4A3E5E" strokeWidth="2" opacity=".55" />
          <path d="M104 96 C132 70 158 70 178 96" fill="none" stroke="#B85B40" strokeWidth="2" opacity=".65" />
          <path d="M102 140 C132 164 158 164 180 140" fill="none" stroke="#B85B40" strokeWidth="2" opacity=".45" />
          {[0, 1, 2, 3, 4, 5].map((item) => {
            const angle = (item * 60 - 90) * Math.PI / 180;
            return <circle key={`a-${item}`} cx={94 + Math.cos(angle) * 50} cy={118 + Math.sin(angle) * 50} r="4" fill="#3A4A36" />;
          })}
          {[0, 1, 2, 3, 4, 5].map((item) => {
            const angle = (item * 60 - 90) * Math.PI / 180;
            return <circle key={`b-${item}`} cx={188 + Math.cos(angle) * 50} cy={118 + Math.sin(angle) * 50} r="4" fill="#4A3E5E" />;
          })}
        </svg>
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-[var(--soft-paper-card)] px-4 py-1.5 font-heading text-sm italic text-[var(--soft-bordeaux)] shadow-[0_8px_18px_-10px_rgba(60,30,20,.25)]">
          карта пары
        </div>
      </div>
    </div>
  );
}

function NumerologySide() {
  return (
    <div className="grid min-h-[20rem] place-items-center rounded-[1.75rem] bg-[linear-gradient(160deg,#F4D9C1,#F8E6D1)] p-10">
      <div className="grid w-72 max-w-full grid-cols-3 gap-2">
        {[3, 7, 1, 9, 2, 5, 4, 8, 6].map((number, index) => (
          <div key={`${number}-${index}`} className="grid aspect-square place-items-center rounded-xl border border-[var(--soft-paper-edge)] font-heading text-3xl italic text-[var(--soft-bordeaux)]" style={{ background: index === 4 ? "var(--soft-bordeaux)" : "var(--soft-paper-card)", color: index === 4 ? "#FBF0E1" : "var(--soft-bordeaux)", fontSize: index === 4 ? 40 : 28 }}>
            {number}
          </div>
        ))}
      </div>
    </div>
  );
}

function JointSide() {
  return (
    <div className="relative min-h-[20rem] rounded-[1.75rem] bg-[linear-gradient(160deg,#DBD3EA,#D6DECC)] p-10">
      <div className="relative mx-auto h-60 w-72 max-w-full">
        <div className="absolute left-0 top-8 grid size-28 place-items-center rounded-full bg-[linear-gradient(140deg,#DBD3EA,#B5A8D1)] font-heading text-4xl font-medium text-[#4A3E5E] shadow-[0_12px_24px_-8px_rgba(74,62,94,.4)]">Э</div>
        <div className="absolute right-0 top-8 grid size-28 place-items-center rounded-full bg-[linear-gradient(140deg,#D6DECC,#9BAE94)] font-heading text-4xl font-medium text-[#3A4A36] shadow-[0_12px_24px_-8px_rgba(58,74,54,.4)]">П</div>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-5 py-2 font-heading italic text-[var(--soft-bordeaux)]">один разговор</div>
      </div>
    </div>
  );
}

function DefaultSide() {
  return (
    <div className="grid min-h-[20rem] place-items-center rounded-[1.75rem] bg-[linear-gradient(160deg,#FFFCF5,#F4D9C1)] p-10">
      <div className="size-28 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff,transparent_38%),conic-gradient(from_30deg,#F4C9A8,#E8B8D1,#D9C9E8,#F4C9A8)] shadow-[0_16px_36px_-18px_rgba(214,117,88,.7)]" />
    </div>
  );
}

function PerspectivesSide() {
  const tiles: Array<{ label: string; sub: string; bg: string; color: string }> = [
    { label: "Разум", sub: "факты · варианты", bg: "linear-gradient(140deg,#F4D9C1,#F8E6D1)", color: "var(--soft-bordeaux)" },
    { label: "Чувства", sub: "что внутри", bg: "linear-gradient(140deg,#E8C4B8,#F4D5C8)", color: "var(--soft-bordeaux)" },
    { label: "Символ", sub: "образ ситуации", bg: "linear-gradient(140deg,#DBD3EA,#E8E1F2)", color: "#4A3E5E" },
    { label: "Действие", sub: "шаги на неделю", bg: "linear-gradient(140deg,#D6DECC,#E5EBDC)", color: "#3A4A36" },
  ];
  return (
    <div className="relative grid min-h-[20rem] place-items-center rounded-[1.75rem] bg-[linear-gradient(160deg,#FFFCF5,#F4D9C1)] p-8" data-testid="product-perspectives-preview">
      <div className="grid w-72 grid-cols-2 gap-3 max-w-full">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl p-4 shadow-[0_8px_18px_-10px_rgba(60,30,20,.25)]" style={{ background: tile.bg, color: tile.color }}>
            <div className="font-heading text-lg italic">{tile.label}</div>
            <div className="mt-1 text-[0.72rem] opacity-80">{tile.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatAnalysisSide() {
  const bubbles: Array<{ side: "left" | "right"; text: string }> = [
    { side: "left", text: "Почему ты не отвечаешь?" },
    { side: "right", text: "Я устал, говорил же." },
    { side: "left", text: "Каждый раз «занят». А для тебя я на втором месте?" },
    { side: "right", text: "Ну вот, опять началось." },
  ];
  return (
    <div className="grid min-h-[20rem] place-items-center rounded-[1.75rem] bg-[linear-gradient(160deg,#F4D9C1,#E8C4B8)] p-8" data-testid="product-chat-analysis-preview">
      <div className="flex w-72 max-w-full flex-col gap-2.5">
        {bubbles.map((bubble, idx) => (
          <div
            key={idx}
            className="max-w-[78%] rounded-[14px] px-3 py-2 text-[11.5px] leading-snug shadow-[0_4px_10px_-4px_rgba(60,30,20,.18)]"
            style={{
              alignSelf: bubble.side === "left" ? "flex-start" : "flex-end",
              background: bubble.side === "left" ? "var(--soft-paper-card)" : "var(--soft-bordeaux)",
              color: bubble.side === "left" ? "var(--soft-ink)" : "#FBF0E1",
            }}
          >
            {bubble.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function CompatibilitySide() {
  return (
    <div className="relative grid min-h-[20rem] place-items-center rounded-[1.75rem] bg-[linear-gradient(160deg,#DBD3EA,#F4D9C1)] p-10" data-testid="product-compatibility-preview">
      <div className="relative flex items-center gap-4">
        <div className="grid size-24 place-items-center rounded-full bg-[linear-gradient(140deg,#E8C4B8,#F4D5C8)] font-heading text-3xl italic text-[var(--soft-bordeaux)] shadow-[0_12px_24px_-8px_rgba(184,91,64,.4)]">А</div>
        <div className="z-10 -mx-3 grid place-items-center rounded-full bg-[var(--soft-paper-card)] px-3 py-1.5 font-heading text-sm italic text-[var(--soft-bordeaux)] shadow-[0_6px_14px_-6px_rgba(60,30,20,.25)]">общее</div>
        <div className="grid size-24 place-items-center rounded-full bg-[linear-gradient(140deg,#DBD3EA,#B5A8D1)] font-heading text-3xl italic text-[#4A3E5E] shadow-[0_12px_24px_-8px_rgba(74,62,94,.4)]">Б</div>
      </div>
    </div>
  );
}

function SevenDaysSide() {
  const days = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
  return (
    <div className="grid min-h-[20rem] place-items-center rounded-[1.75rem] bg-[linear-gradient(160deg,#F4D9C1,#FFFCF5)] p-10" data-testid="product-seven-days-preview">
      <div className="grid w-72 max-w-full grid-cols-7 gap-1.5">
        {days.map((day, index) => (
          <div
            key={day}
            className="grid aspect-square place-items-center rounded-[10px] border text-[0.72rem] font-semibold"
            style={{
              borderColor: index < 3 ? "var(--soft-terracotta-dark)" : index === 3 ? "var(--soft-apricot)" : "var(--soft-paper-edge)",
              background: index < 3 ? "var(--soft-terracotta-dark)" : index === 3 ? "var(--soft-apricot)" : "var(--soft-paper-card)",
              color: index < 3 ? "#FBF0E1" : index === 3 ? "var(--soft-bordeaux)" : "var(--soft-ink-faint)",
            }}
          >
            {index < 3 ? "✓" : day}
          </div>
        ))}
      </div>
    </div>
  );
}

function ClarityPracticeSide() {
  return (
    <div className="grid min-h-[20rem] place-items-center rounded-[1.75rem] bg-[linear-gradient(160deg,#D6DECC,#F4D9C1)] p-10" data-testid="product-clarity-practice-preview">
      <div className="relative w-72 max-w-full">
        <div className="rounded-[1.25rem] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-5 shadow-[0_14px_28px_-12px_rgba(60,30,20,.22)]">
          <div className="soft-eyebrow text-[0.6rem]">сегодняшний вопрос</div>
          <p className="mt-3 font-heading text-lg italic leading-snug text-[var(--soft-bordeaux)]">
            Какая забота о себе сегодня была бы по-настоящему добра?
          </p>
          <div className="mt-4 flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-[var(--soft-paper-edge)]">
              <div className="h-1 rounded-full bg-[var(--soft-terracotta-dark)]" style={{ width: "42%" }} />
            </div>
            <span className="text-[0.6rem] text-[var(--soft-ink-faint)]">11/30</span>
          </div>
        </div>
        <div className="absolute -bottom-3 right-2 rotate-[6deg] rounded-full bg-[var(--soft-apricot)] px-3 py-1 text-[0.65rem] font-semibold text-[var(--soft-bordeaux)]">+1 балл</div>
      </div>
    </div>
  );
}

function productSide(product: V5Product) {
  if (product.slug === "deep-report") return <DeepReportSide />;
  if (product.slug === "my-map") return <ExtendedMapSide />;
  if (product.slug === "tarot") return <TarotSide />;
  if (product.slug === "natal-chart") return <NatalSide />;
  if (product.slug === "synastry") return <SynastrySide />;
  if (product.slug === "numerology") return <NumerologySide />;
  if (product.slug === "joint-session") return <JointSide />;
  if (product.slug === "perspectives") return <PerspectivesSide />;
  if (product.slug === "chat-analysis") return <ChatAnalysisSide />;
  if (product.slug === "compatibility") return <CompatibilitySide />;
  if (product.slug === "seven-days") return <SevenDaysSide />;
  if (product.slug === "clarity-practice") return <ClarityPracticeSide />;
  return <DefaultSide />;
}

function DeepReportSections() {
  const toc = [
    "Что я слышу в вашем вопросе",
    "Главная развилка",
    "Карта факт-чувство-предположение",
    "Четыре ракурса · разум · чувства · символ · действие",
    "Возможные сценарии и их цена",
    "Безопасный маршрут на 2 недели",
    "С кем продолжить — если захочется",
  ];

  return (
    <>
      <section className="soft-shell mt-12">
        <div className="grid gap-8 lg:grid-cols-[minmax(16rem,0.72fr)_minmax(0,1fr)] lg:items-start">
          <div className="soft-card p-6 lg:sticky lg:top-[84px]" data-testid="deep-report-toc">
            <p className="soft-eyebrow mb-3">оглавление</p>
            {toc.map((item, index) => (
              <div key={item} className="flex gap-3 py-2.5" style={{ borderTop: index ? "1px solid var(--soft-paper-edge)" : "none" }}>
                <span className="w-6 shrink-0 font-heading text-sm italic text-[var(--soft-terracotta-dark)]">{String(index + 1).padStart(2, "0")}</span>
                <span className="text-sm">{item}</span>
              </div>
            ))}
            <div className="mt-6 flex gap-2">
              {["PDF", "Карта", "Поделиться"].map((item) => <span key={item} className="soft-chip flex-1 justify-center">{item}</span>)}
            </div>
          </div>
          <div>
            <div className="soft-card p-7" data-testid="deep-report-sample-main-fork">
              <p className="soft-eyebrow">пример · фрагмент</p>
              <h3 className="soft-h3 mt-2">02 · Главная развилка</h3>
              <p className="mt-4 font-heading text-lg leading-relaxed text-[var(--soft-ink)]">
                Под вопросом «остаться или уйти» в вашем тексте устойчиво звучит другой: <span className="soft-italic">сколько меня осталось рядом с этим человеком</span>. Это два разных вопроса — и они ведут к разным шагам.
              </p>
              <p className="mt-4 font-heading text-[1.06rem] leading-relaxed text-[var(--soft-ink-soft)]">
                Решение «остаться» имеет смысл, если вы возвращаетесь к себе в этих отношениях. Решение «уйти» — если рядом с этим человеком вы регулярно становитесь меньше, тише, осторожнее.
              </p>
            </div>
            <div className="soft-card mt-4 p-7" data-testid="deep-report-fact-feeling-assumption">
              <h3 className="soft-h3">03 · Карта факт-чувство-предположение</h3>
              <div className="mt-5 flex flex-col gap-3">
                {[
                  ["факт", "Не озвучивали партнёру свои ощущения 4 месяца", "var(--soft-apricot)", "var(--soft-bordeaux)"],
                  ["чувство", "В описании — «не хочу его расстраивать», и почти нет «я хочу»", "var(--soft-rose)", "var(--soft-bordeaux)"],
                  ["предположение", "«Он не выдержит честного разговора» — это страх, не данные", "var(--soft-lilac-soft)", "#4A3E5E"],
                ].map(([kind, text, background, color]) => (
                  <div key={kind} className="flex items-start gap-4">
                    <span className="soft-badge shrink-0" style={{ background, color }}>{kind}</span>
                    <span className="text-sm leading-relaxed">{text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 rounded-[var(--soft-radius-lg)] bg-[linear-gradient(140deg,#FFFCF5,#F4D9C1)] p-7" data-testid="deep-report-safe-route">
              <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">06 · Безопасный маршрут · отрывок</p>
              <div className="mt-4 flex flex-col gap-2">
                {[
                  ["1", "день 1 — три фразы, которые давно хотели сказать вслух"],
                  ["3", "день 3 — разговор без выводов: «я не знаю, что с этим делать, но это есть»"],
                  ["7", "день 7 — выбрать: продолжить разговор или взять паузу для себя"],
                  ["14", "день 14 — записать, что изменилось в ощущении себя"],
                ].map(([day, text]) => (
                  <div key={day} className="flex gap-3">
                    <span className="w-6 text-sm font-semibold text-[var(--soft-terracotta-dark)]">{day}</span>
                    <span className="text-sm text-[var(--soft-bordeaux)]">{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="soft-shell mt-12" data-testid="deep-report-fit-cards">
        <div className="mx-auto mb-8 max-w-xl text-center">
          <p className="soft-eyebrow">кому подходит</p>
          <h2 className="soft-h2 mt-2">Если хочется <span className="soft-italic">не разговора</span>, а документа</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["Тема большая", "Несколько разборов вокруг одного вопроса — пора собрать всё в один документ."],
            ["Хочется вернуться позже", "Прочесть через месяц и увидеть, что изменилось."],
            ["Идёте к специалисту", "Принести готовый разбор, чтобы не объяснять с нуля первые 30 минут."],
          ].map(([title, text]) => (
            <div key={title} className="soft-card p-6">
              <h3 className="soft-h3 text-[1.2rem]">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function ExtendedMapSections() {
  return (
    <section className="soft-shell mt-12" data-testid="extended-map-central-story">
      <div className="grid grid-cols-12 gap-4">
        <div className="soft-card col-span-12 bg-[linear-gradient(140deg,#FFFCF5,#F4D9C1)] p-7 lg:col-span-8">
          <p className="soft-eyebrow">пример · центральный сюжет года</p>
          <p className="mt-4 font-heading text-3xl italic leading-tight text-[var(--soft-bordeaux)]">
            Год прошёл под одним сюжетом: «учиться занимать место без чувства вины». Это было тише, чем «уйти или остаться», но сильнее почти любого внешнего события.
          </p>
        </div>
        <div className="soft-card col-span-12 bg-[var(--soft-bordeaux)] p-7 text-[#FBF0E1] lg:col-span-4">
          <p className="soft-eyebrow text-[#F4D9C1]">что окрепло</p>
          <p className="mt-4 font-heading text-2xl">«Я» в фразах</p>
          <p className="mt-2 text-sm text-[#E8C4B8]">+62% за последние 6 месяцев</p>
        </div>
        {[
          ["темы по сезонам", "зима · Сепарация\nвесна · Работа\nлето · Тело\nосень · Границы"],
          ["повторы — стихли", "«я слишком много»\n«надо быть удобной»\n«нельзя расстраивать»"],
          ["повторы — появились", "«мне можно подумать»\n«мне нужно медленнее»\n«я разрешаю себе»"],
        ].map(([title, text]) => (
          <div key={title} className="soft-card col-span-12 p-6 md:col-span-4">
            <p className="soft-eyebrow">{title}</p>
            <p className="mt-4 whitespace-pre-line font-heading text-lg italic leading-relaxed text-[var(--soft-bordeaux)]">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function TarotSections() {
  return (
    <section className="soft-shell mt-12" data-testid="tarot-live-example">
      <div className="soft-card bg-[linear-gradient(160deg,#4A3E5E,#2A2240)] p-8 text-center text-[#DBD3EA] md:p-10">
        <p className="soft-eyebrow text-[#DBD3EA]/70">живой пример</p>
        <p className="mt-3 font-heading text-2xl italic text-[#FBF0E1]">«Стоит ли мне сейчас увольняться?»</p>
        <div className="mt-8 flex flex-wrap justify-center gap-5">
          {[
            ["Прошлое", "Жрица"],
            ["Настоящее", "Башня"],
            ["Возможное", "Звезда"],
          ].map(([slot, card]) => (
            <div key={slot} className="w-40">
              <div className="grid h-60 place-items-center rounded-xl border-2 border-[#DBD3EA] bg-[linear-gradient(160deg,#F4D9C1,#DBD3EA)] text-[var(--soft-bordeaux)] shadow-[0_12px_24px_-8px_rgba(0,0,0,.4)]">
                <div className="text-center">
                  <span className="font-heading text-5xl italic">★</span>
                  <p className="mt-3 font-heading text-2xl italic">{card}</p>
                </div>
              </div>
              <p className="mt-3 font-heading text-xs uppercase tracking-widest text-[#DBD3EA]">{slot}</p>
            </div>
          ))}
        </div>
        <button type="button" className="soft-button mt-8 bg-[#F4D9C1] text-[var(--soft-bordeaux)]">Раскрыть карты <ArrowRight className="size-4" aria-hidden="true" /></button>
        <div className="soft-card mx-auto mt-8 max-w-3xl border-[#FBF0E1]/20 bg-[#FBF0E1]/10 p-6 text-left">
          <p className="soft-eyebrow text-[#F4D9C1]">интерпретация · фрагмент</p>
          <p className="mt-3 font-heading text-lg italic leading-relaxed text-[#FBF0E1]">
            В прошлом — <b>Жрица</b>: вы давно слышали внутри ответ, но не доверяли ему вслух. В настоящем — <b>Башня</b>: разрушается не работа, а образ «правильной». В возможном — <b>Звезда</b>: спокойствие после паузы.
          </p>
        </div>
      </div>
    </section>
  );
}

function NatalSections() {
  return (
    <section className="soft-shell mt-12" data-testid="natal-birth-data">
      <div className="soft-card p-7">
        <p className="soft-eyebrow mb-4">данные для расчёта</p>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ["Дата рождения", "12.04.1992"],
            ["Время рождения", "14:35 МСК"],
            ["Место рождения", "Москва, Россия"],
          ].map(([label, value]) => (
            <div key={label} className="soft-card-flat p-4">
              <p className="soft-eyebrow">{label}</p>
              <p className="mt-2 font-heading text-lg text-[var(--soft-bordeaux)]">{value}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {[
          ["Солнце в Овне", "сильное «я»", "Энергия инициативы. Где трудно — на стартах нового."],
          ["Луна в Раке", "эмоциональный язык", "Дом и память — основной способ заботы."],
          ["Меркурий в Близнецах", "как думаете", "Через диалог и обмен. Молча мыслить трудно."],
        ].map(([label, title, text]) => (
          <div key={label} className="soft-card p-6">
            <p className="soft-eyebrow">{label}</p>
            <h3 className="soft-h3 mt-2">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{text}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-[var(--soft-radius-lg)] bg-[linear-gradient(160deg,#D6DECC,#E5EBDC)] p-7">
        <p className="soft-eyebrow text-[#3A4A36]">акцент года</p>
        <p className="mt-3 font-heading text-2xl italic leading-snug text-[#3A4A36]">
          Сатурн возвращается к натальной позиции — это период подведения итогов «первой взрослой жизни» и выбора, что вы оставляете и куда идёте дальше. Не «кризис», а «инвентаризация».
        </p>
      </div>
    </section>
  );
}

function SynastrySections() {
  return (
    <section className="soft-shell mt-12" data-testid="synastry-relationship-map">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="soft-card bg-[linear-gradient(140deg,#D6DECC,#E5EBDC)] p-7">
          <p className="soft-eyebrow text-[#3A4A36]">пример · карта пары</p>
          <p className="mt-4 font-heading text-2xl italic leading-snug text-[#3A4A36]">
            Один человек быстрее успокаивается через разговор, другой — через паузу и сбор мыслей. Конфликт начинается не из-за несовместимости, а из-за разного темпа возвращения к контакту.
          </p>
        </div>
        <div className="soft-card p-7">
          <p className="soft-eyebrow">что откроется</p>
          <div className="mt-4 grid gap-3">
            {[
              ["общий ресурс", "где вам легче поддерживать друг друга"],
              ["разные ритмы", "что один воспринимает как близость, а другой — как давление"],
              ["вопросы для разговора", "формулировки без verdict и обвинений"],
            ].map(([title, text]) => (
              <div key={title} className="soft-card-flat p-4">
                <p className="text-sm font-semibold text-[var(--soft-bordeaux)]">{title}</p>
                <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function NumerologySections() {
  return (
    <section className="soft-shell mt-12" data-testid="numerology-number-cards">
      <div className="grid gap-4 md:grid-cols-2">
        {[
          ["5", "число пути", "Любопытство, изменения, обучение. Сильны на стыках разных миров."],
          ["7", "число души", "Внутреннее одиночество и наблюдение. Нужно время «в тишине»."],
          ["3", "число выражения", "Творческий язык — слова, образы, диалоги."],
          ["9", "личный год", "Год завершений. Время освободить место."],
        ].map(([number, title, text]) => (
          <div key={title} className="soft-card p-6">
            <div className="flex gap-4">
              <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-[var(--soft-bordeaux)] font-heading text-4xl italic text-[#FBF0E1]">{number}</span>
              <div>
                <p className="soft-eyebrow">{title}</p>
                <p className="mt-2 font-heading text-base italic leading-relaxed text-[var(--soft-ink)]">{text}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-[var(--soft-radius-lg)] bg-[linear-gradient(140deg,#F4D9C1,#F8E6D1)] p-7">
        <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">что с этим делать</p>
        <p className="mt-3 font-heading text-2xl italic leading-snug text-[var(--soft-bordeaux)]">
          Числа не объясняют вас. Они дают язык, чтобы быстрее заметить, где вы тратите силы против своей конструкции — и где они приходят сами.
        </p>
      </div>
    </section>
  );
}

function JointSessionSections() {
  return (
    <section className="soft-shell mt-12" data-testid="joint-session-timeline">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="soft-eyebrow">структура встречи</p>
          <h2 className="soft-h2 mt-2">Один час · понятный ритм</h2>
        </div>
        <span className="text-sm text-[var(--soft-ink-faint)]">60 минут · видеовстреча</span>
      </div>
      <div className="flex flex-col gap-2">
        {[
          ["00:00 — 00:05", "Знакомство и согласование запроса", "Оба специалиста, вы. Договариваемся о фокусе встречи."],
          ["00:05 — 00:25", "Символический разбор", "Эзотерик ведёт: расклад, натальная карта или числовой портрет."],
          ["00:25 — 00:45", "Психотерапевтический разбор", "Психотерапевт продолжает: проверка реальности, чувства, контекст."],
          ["00:45 — 00:55", "Совместное направление", "Оба специалиста сводят разговор в один безопасный следующий шаг."],
          ["00:55 — 01:00", "Ваши вопросы", "Можно задать всё, что не успели."],
        ].map(([time, title, text]) => (
          <div key={time} className="soft-card-flat grid gap-4 p-5 md:grid-cols-[8rem_2.25rem_1fr] md:items-center">
            <span className="font-mono text-sm italic text-[var(--soft-terracotta-dark)]">{time}</span>
            <span className="grid size-9 place-items-center rounded-xl bg-[var(--soft-paper-card)] text-[var(--soft-bordeaux)]">✦</span>
            <div>
              <p className="font-semibold">{title}</p>
              <p className="mt-1 text-sm text-[var(--soft-ink-faint)]">{text}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="soft-card bg-[var(--soft-lilac-soft)] p-6">
          <p className="soft-eyebrow text-[#4A3E5E]">когда подходит</p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-[#4A3E5E]">
            <li>Большая тема, и нужны и метафора, и реальность</li>
            <li>Цените эзотерический язык, но хотите этическую опору</li>
            <li>Долгая ситуация — обычный формат не сдвигает</li>
          </ul>
        </div>
        <div className="soft-card bg-[var(--soft-bordeaux)] p-6 text-[#E8C4B8]">
          <p className="soft-eyebrow text-[#F4D9C1]">что не происходит</p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
            <li>нет «диагнозов по карте» — ни эзотерических, ни медицинских</li>
            <li>нет прогнозов как фактов — есть темы и развилки</li>
            <li>специалисты работают по протоколу, а не спорят между собой</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function ProductSpecificSections({ product }: { product: V5Product }) {
  const sections =
    product.slug === "deep-report" ? <DeepReportSections /> :
    product.slug === "my-map" ? <ExtendedMapSections /> :
    product.slug === "tarot" ? <TarotSections /> :
    product.slug === "natal-chart" ? <NatalSections /> :
    product.slug === "synastry" ? <SynastrySections /> :
    product.slug === "numerology" ? <NumerologySections /> :
    product.slug === "joint-session" ? <JointSessionSections /> :
    null;
  if (!sections) return null;

  // #10: the order CTA now comes first; the bulky example blocks live behind a
  // collapsed disclosure so they inform without walling off the purchase.
  return (
    <details className="group mt-10" data-testid="product-example-disclosure">
      <summary className="soft-shell flex cursor-pointer list-none items-center justify-between gap-3 rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="soft-eyebrow">пример</span>
          <span className="mt-1 block font-heading text-lg text-[var(--soft-bordeaux)]">Посмотреть пример полного разбора</span>
        </span>
        <ChevronDown className="size-5 shrink-0 text-[var(--soft-ink-soft)] transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      {sections}
    </details>
  );
}

function ProductActionSurface({
  product,
  search,
}: {
  product: V5Product;
  search?: { dialogueId?: string; invite?: string };
}) {
  if (product.slug === "deep-report") return <DeepReportActions dialogueId={search?.dialogueId ?? null} />;
  if (product.slug === "perspectives") return <PerspectivesActions dialogueId={search?.dialogueId ?? null} />;
  if (product.slug === "chat-analysis") return <ChatAnalysisActions />;
  if (product.slug === "compatibility") return <CompatibilityActions dialogueId={search?.dialogueId ?? null} inviteToken={search?.invite ?? null} />;
  if (product.slug === "seven-days") return <SevenDaysActions dialogueId={search?.dialogueId ?? null} />;
  if (product.slug === "tarot") {
    return <SymbolicProductActions productKey="tarot" title="Расклад Таро" promptLabel="Вопрос для расклада" placeholder="Например: стоит ли мне сейчас менять работу, если внутри много сомнений?" creditCost={2} />;
  }
  if (product.slug === "natal-chart") {
    return <SymbolicProductActions productKey="natal-chart" title="Натальная карта" promptLabel="Дата, время и место рождения" placeholder="12.04.1992, 14:35, Москва. Вопрос: что сейчас важно понять про работу?" creditCost={4} />;
  }
  if (product.slug === "synastry") return <SynastryActions />;
  if (product.slug === "numerology") {
    return <SymbolicProductActions productKey="numerology" title="Числовой портрет" promptLabel="Имя и дата рождения" placeholder="Анна, 12.04.1992. Хочу понять повторяющийся сценарий в отношениях." creditCost={2} />;
  }
  if (product.slug === "my-map") {
    return <SymbolicProductActions productKey="my-map" title="Расширенная карта" promptLabel="История Моей карты" placeholder="История собирается автоматически из сохранённых вопросов, маршрутов и результатов." creditCost={6} />;
  }
  if (product.slug === "joint-session") return <JointSessionActions />;
  return null;
}

function ProductPrimaryAction({ product }: { product: V5Product }) {
  if (product.productKey) {
    return (
      <ProductPurchaseControls
        productKey={product.productKey}
        label={product.directCta ?? product.cta}
        checkoutSource={`product-page-${product.slug}`}
        creditCost={product.creditCost}
      />
    );
  }

  if (product.directHref) {
    return (
      <Link
        href={product.directHref}
        className="soft-button soft-button-primary"
        data-analytics-event="direct_product_link_clicked"
        data-analytics-product={product.slug}
      >
        {product.directCta ?? product.cta}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    );
  }

  return (
    <Link
      href="/products"
      className="soft-button soft-button-primary"
      data-analytics-event="products_catalog_clicked"
      data-analytics-target="/products"
      data-testid="product-dialogue-cta"
    >
      {product.cta}
      <ArrowRight className="size-4" aria-hidden="true" />
    </Link>
  );
}

function ProductFooter() {
  return (
    <section className="soft-shell mt-12 pb-20">
      <div className="soft-card-flat soft-product-legal mx-auto max-w-3xl">
        <div className="flex items-center gap-3">
          <LockKeyhole className="size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
          <span className="font-semibold text-[var(--soft-bordeaux)]">Принцип ETerapy для любого формата</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Результат носит информационно-рефлексивный характер. Не является медицинской или юридической консультацией. Если вопрос связан с риском для здоровья или безопасности — мы направим к специалисту.
        </p>
      </div>
    </section>
  );
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ dialogueId?: string; invite?: string }>;
}) {
  const { slug } = await params;
  const search = await searchParams;
  const product = getV5Product(slug);
  if (!product) notFound();

  return (
    <main className="soft-clarity-page soft-product-detail-page" data-testid={`product-page-${product.slug}`}>
      <PublicJsonLd route={product.route as PublicSeoRoute} />
      <ProductHero product={product} search={search} side={productSide(product)} />
      {/* #10: order CTA first, examples (collapsed) after — purchase isn't
          buried under a wall of example fragments. */}
      <section id={product.slug === "perspectives" ? "perspectives-actions" : undefined} className="soft-shell mt-10">
        <ProductActionSurface product={product} search={search} />
      </section>
      <ProductSpecificSections product={product} />
      <ProductFooter />
    </main>
  );
}
