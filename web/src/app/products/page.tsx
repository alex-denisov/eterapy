import { ArrowRight, FileText, HeartHandshake, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { ServiceCatalog } from "@/components/products/service-catalog";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";

export const metadata = createPublicPageMetadata("/products");

export default function ProductsPage() {
  return (
    <main className="soft-clarity-page soft-products-page" data-testid="products-page">
      <PublicJsonLd route="/products" />

      <section className="soft-shell soft-products-hero">
        <div>
          <p className="soft-eyebrow">каталог форматов</p>
          <h1 className="soft-display mt-3" style={{ maxWidth: "42rem" }}>
            Углубление под <span className="soft-italic">ваш</span> вопрос
          </h1>
          <p className="soft-lede mt-5" style={{ maxWidth: "42rem" }}>
            Цифровые разборы, форматы со специалистом и совместные сессии. Сначала диалог ясности,
            затем подходящая глубина по теме и состоянию.
          </p>
          <div className="soft-products-hero-actions mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/checkin"
              className="soft-button soft-button-primary"
              data-analytics-event="dialogue_cta_clicked"
              data-analytics-target="/checkin"
              data-testid="products-dialogue-cta"
            >
              Начать диалог
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/pricing" className="soft-button soft-button-ghost">
              Посмотреть тарифы
            </Link>
          </div>
        </div>
        <aside className="soft-card soft-products-preview" aria-label="Как выбирается продукт">
          <div className="relative">
            <p className="soft-eyebrow">после первичного ответа</p>
            <h2 className="soft-h3 mt-3">Формат подбирается по контексту</h2>
            <div className="mt-5 grid gap-3">
              {[
                { icon: MessageSquareText, title: "Если нужна ясность", text: "остается первичный ответ и карта" },
                { icon: FileText, title: "Если нужна глубина", text: "отчет, ракурсы, переписка или 7 дней" },
                { icon: HeartHandshake, title: "Если нужен человек", text: "2-3 специалиста с понятным основанием" },
              ].map((item) => (
                <div key={item.title} className="soft-card-flat flex items-start gap-3 p-4">
                  <span className="soft-step-number shrink-0" style={{ width: "2.1rem" }}>
                    <item.icon className="size-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[var(--soft-bordeaux)]">{item.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-faint)]">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <section className="soft-shell pb-20">
        <div className="mb-6">
          <p className="soft-eyebrow">форматы и услуги</p>
          <h2 className="soft-h2 mt-2">Выберите глубину или следующего человека</h2>
        </div>
        <ServiceCatalog showFooterLink={false} />
      </section>
    </main>
  );
}
