import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, LockKeyhole } from "lucide-react";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { DeepReportActions } from "@/components/products/deep-report-actions";
import { PerspectivesActions } from "@/components/products/perspectives-actions";
import { ChatAnalysisActions } from "@/components/products/chat-analysis-actions";
import { CompatibilityActions } from "@/components/products/compatibility-actions";
import { SevenDaysActions } from "@/components/products/seven-days-actions";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
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

function ProductPreview({ product }: { product: V5Product }) {
  if (product.slug === "tarot") {
    return (
      <div className="soft-card soft-product-preview soft-symbolic-preview" data-testid="product-tarot-preview">
        <div className="flex justify-center gap-3">
          {["Прошлое", "Сейчас", "Возможное"].map((label, index) => (
            <div key={label} className="soft-tarot-card" style={{ transform: `rotate(${(index - 1) * 5}deg) translateY(${index === 1 ? "-6px" : "4px"})` }}>
              <span>★</span>
              <small>{label}</small>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm leading-relaxed text-[#4a3e5e]">
          Карты используются как метафора. В результате нет фатальных прогнозов, давления или обещаний будущего.
        </p>
      </div>
    );
  }

  if (product.slug === "natal-chart") {
    return (
      <div className="soft-card soft-product-preview" data-testid="product-natal-preview" style={{ background: "linear-gradient(160deg, #d6decc, #eff2e8)" }}>
        <div className="soft-natal-orbit" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((item) => <span key={item} />)}
        </div>
        <div className="soft-card-flat mt-5 p-5">
          <p className="soft-eyebrow text-[#3a4a36]">пример фокуса</p>
          <h3 className="soft-h3 mt-2 text-[#3a4a36]">Не «кто вы навсегда», а какие темы сейчас стоит рассмотреть.</h3>
        </div>
      </div>
    );
  }

  if (product.slug === "numerology") {
    return (
      <div className="soft-card soft-product-preview" data-testid="product-numerology-preview" style={{ background: "linear-gradient(160deg, #f4d9c1, #fff3e7)" }}>
        <div className="grid grid-cols-3 gap-2">
          {["3", "7", "9", "11", "22", "2026"].map((item) => (
            <div key={item} className="soft-card-flat grid aspect-square place-items-center p-4 font-heading text-3xl font-semibold text-[var(--soft-bordeaux)]">
              {item}
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Числа превращаются в вопросы к себе: где повтор, где ресурс, где выбор на ближайший цикл.
        </p>
      </div>
    );
  }

  if (product.slug === "joint-session") {
    return (
      <div className="soft-card soft-product-preview" data-testid="product-joint-session-preview">
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["Эзотерик", "символический разбор", "#4a3e5e", "linear-gradient(160deg, #dbd3ea, #eee6f5)"],
            ["Психотерапевт", "контекст и безопасный шаг", "#3a4a36", "linear-gradient(160deg, #d6decc, #eff2e8)"],
          ].map(([title, text, color, bg]) => (
            <div key={title} className="soft-card-flat p-5" style={{ background: bg, color }}>
              <p className="soft-eyebrow" style={{ color }}>{title}</p>
              <h3 className="mt-3 font-heading text-xl font-semibold">{text}</h3>
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Клиент видит цену и состав встречи до бронирования. Контекст передается только по согласию.
        </p>
      </div>
    );
  }

  if (product.slug === "chat-analysis") {
    return (
      <div className="soft-card soft-product-preview" data-testid="product-chat-analysis-preview">
        <div className="soft-product-tabs">
          {["1. Переписка", "2. Контекст", "3. Разбор"].map((item, index) => (
            <span key={item} className={index === 0 ? "soft-chip soft-chip-warm" : "soft-chip"}>{item}</span>
          ))}
        </div>
        <div className="soft-card-flat mt-4 p-4">
          <p className="soft-eyebrow">переписка</p>
          <p className="mt-3 whitespace-pre-line font-heading text-lg leading-relaxed text-[var(--soft-ink)]">
            — Ты опять не отвечаешь.{"\n"}— Я был занят, говорил же.{"\n"}— Я просто хочу понимать, что у нас происходит.
          </p>
        </div>
        <p className="mt-4 text-sm text-[var(--soft-ink-soft)]">
          Имена заменяются на «Я» и «Собеседник». Исходник можно удалить после результата.
        </p>
      </div>
    );
  }

  if (product.slug === "compatibility") {
    return (
      <div className="soft-card soft-product-preview" data-testid="product-compatibility-preview">
        <div className="soft-compat-grid">
          <div className="soft-card-flat p-5 text-center">
            <div className="soft-person-orb mx-auto">Вы</div>
            <h3 className="soft-h3 mt-3">Ваш разбор</h3>
            <p className="text-sm text-[var(--soft-ink-soft)]">готов</p>
          </div>
          <div className="self-center text-center font-heading text-3xl italic text-[var(--soft-bordeaux)]">+</div>
          <div className="soft-card-flat p-5 text-center">
            <div className="soft-person-orb soft-person-orb-muted mx-auto">?</div>
            <h3 className="soft-h3 mt-3">Партнер</h3>
            <p className="text-sm text-[var(--soft-ink-soft)]">нужно согласие</p>
          </div>
        </div>
        <p className="mt-5 text-center text-sm text-[var(--soft-ink-soft)]">
          Отчет открывается обоим одновременно. Приватные ответы партнера не показываются автору до завершения.
        </p>
      </div>
    );
  }

  if (product.slug === "seven-days") {
    return (
      <div className="soft-card soft-product-preview" data-testid="product-seven-days-preview">
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((day) => (
            <span key={day} className={day <= 3 ? "soft-day-pill soft-day-pill-done" : day === 4 ? "soft-day-pill soft-day-pill-today" : "soft-day-pill"}>
              {day}
            </span>
          ))}
        </div>
        <div className="soft-card-flat mt-5 p-5">
          <p className="soft-eyebrow">день 3</p>
          <h3 className="soft-h3 mt-2">Развилка</h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Разделить: что зависит от вас, что не зависит, и какой шаг не разрушит ничего сегодня.
          </p>
        </div>
      </div>
    );
  }

  if (product.slug === "perspectives") {
    const angles = [
      { name: "Разум", desc: "Факты, варианты, последствия — без давления." },
      { name: "Чувства", desc: "Что внутри — эмоции и телесные сигналы." },
      { name: "Символ", desc: "Образ ситуации — метафора без фатальности." },
      { name: "Действие", desc: "Один безопасный шаг на ближайшую неделю." },
    ];
    return (
      <div className="soft-product-angles" data-testid="product-perspectives-preview">
        {angles.map((angle, index) => (
          <div key={angle.name} className={`soft-card soft-angle-tile soft-angle-${index + 1}`}>
            <p className="soft-eyebrow">ракурс 0{index + 1}</p>
            <h3 className="soft-h3 mt-2">{angle.name}</h3>
            <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">{angle.desc}</p>
          </div>
        ))}
      </div>
    );
  }

  if (product.slug === "my-map") {
    return (
      <div className="soft-card soft-product-preview" data-testid="product-my-map-preview">
        <div className="soft-map-preview-grid">
          {["Отношения", "Работа", "Границы", "Семья", "Пауза", "Выбор", "Тело", "Голос"].map((topic, index) => (
            <div key={topic} className={`soft-map-preview-tile soft-map-preview-tile-${(index % 4) + 1}`}>
              {topic}
            </div>
          ))}
        </div>
        <div className="soft-card-flat mt-5 p-5">
          <p className="soft-eyebrow">пример вывода</p>
          <h3 className="soft-h3 mt-2">Карта замечает повторяющиеся темы и собирает их без публичности.</h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Можно сохранить результат, скрыть его, удалить, экспортировать или поделиться обезличенным фрагментом.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="soft-card soft-product-preview" data-testid="product-report-preview">
      <div className="soft-report-index">
        {["Обзор", "Сценарии", "Риски", "Рекомендации", "План действий"].map((item, index) => (
          <span key={item} className={index === 0 ? "soft-chip soft-chip-warm" : "soft-chip"}>{item}</span>
        ))}
      </div>
      <div className="soft-card-flat mt-5 p-5">
        <p className="soft-eyebrow">предпросмотр</p>
        <h3 className="soft-h3 mt-2">Развернутый отчет открывается после оплаты или активной подписки.</h3>
        <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Полный результат можно сохранить в Мою карту, экспортировать или удалить там, где это юридически допустимо.
        </p>
      </div>
    </div>
  );
}

function ProductPrimaryAction({ product }: { product: V5Product }) {
  if (product.productKey) {
    return (
      <ProductPurchaseControls
        productKey={product.productKey}
        label={product.directCta ?? product.cta}
        checkoutSource={`product-page-${product.slug}`}
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
      href="/checkin"
      className="soft-button soft-button-primary"
      data-analytics-event="dialogue_cta_clicked"
      data-analytics-target="/checkin"
      data-testid="product-dialogue-cta"
    >
      {product.cta}
      <ArrowRight className="size-4" aria-hidden="true" />
    </Link>
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

      <section className="soft-shell soft-product-detail-hero">
        <div>
          <Link href="/products" className="soft-chip">← Все продукты</Link>
          <p className="soft-eyebrow mt-7">{product.eyebrow}</p>
          <h1 className="soft-display mt-3">{product.name}</h1>
          <p className="soft-lede mt-5 max-w-xl">{product.summary}</p>

          <div className="mt-7 flex flex-wrap items-end gap-6">
            <div>
              <p className="font-heading text-5xl font-semibold text-[var(--soft-bordeaux)]">{product.price}</p>
              {product.creditPrice && (
                <p className="mt-1 text-sm font-semibold text-[var(--soft-terracotta-dark)]">{product.creditPrice}</p>
              )}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              {product.slug === "perspectives" ? (
                search?.dialogueId ? (
                  <a href="#perspectives-actions" className="soft-button soft-button-primary">
                    Получить 4 ракурса
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </a>
                ) : (
                  <Link
                    href="/checkin"
                    className="soft-button soft-button-primary"
                    data-analytics-event="dialogue_cta_clicked"
                    data-analytics-target="/checkin"
                    data-analytics-product="perspectives"
                    data-testid="product-dialogue-cta"
                  >
                    Начать бесплатный диалог
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                )
              ) : (
                <>
                  <ProductPrimaryAction product={product} />
                  <Link
                    href="/checkin"
                    className="soft-button soft-button-ghost"
                    data-analytics-event="dialogue_cta_clicked"
                    data-analytics-target="/checkin"
                    data-testid="product-dialogue-cta"
                  >
                    Сначала бесплатный диалог
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </>
              )}
              <Link href="/products" className="soft-button soft-button-ghost">
                Все продукты
              </Link>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-[var(--soft-ink-faint)] max-w-md">{product.privacy}</p>
        </div>

        <div>
          <ProductPreview product={product} />
        </div>
      </section>

      {product.slug !== "perspectives" && (
        <section className="soft-shell py-2">
          <div className="soft-card p-5 md:p-7">
            <p className="soft-eyebrow">что получает пользователь</p>
            <h2 className="soft-h2 mt-2">{product.result}</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {product.mechanics.map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-ink-soft)]">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {product.slug === "deep-report" && (
        <section className="soft-shell">
          <DeepReportActions dialogueId={search?.dialogueId ?? null} />
        </section>
      )}

      {product.slug === "perspectives" && (
        <section id="perspectives-actions" className="soft-shell">
          <PerspectivesActions dialogueId={search?.dialogueId ?? null} />
        </section>
      )}

      {product.slug === "chat-analysis" && (
        <section className="soft-shell">
          <ChatAnalysisActions />
        </section>
      )}

      {product.slug === "compatibility" && (
        <section className="soft-shell">
          <CompatibilityActions dialogueId={search?.dialogueId ?? null} inviteToken={search?.invite ?? null} />
        </section>
      )}

      {product.slug === "seven-days" && (
        <section className="soft-shell">
          <SevenDaysActions dialogueId={search?.dialogueId ?? null} />
        </section>
      )}

      <section className="soft-shell pb-20">
        <div className="soft-card-flat soft-product-legal mx-auto max-w-3xl">
          <div className="flex items-center gap-3">
            <LockKeyhole className="size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
            <span className="font-semibold text-[var(--soft-bordeaux)]">Принцип ETerapy для любого формата</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Результат носит информационно-рефлексивный характер. Не является медицинской, юридической, финансовой или психологической консультацией. При признаках экстренной ситуации монетизация останавливается, а сценарий переводится в «Экстренную поддержку».
          </p>
        </div>
      </section>
    </main>
  );
}
