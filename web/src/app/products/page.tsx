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
            Цифровые разборы, форматы со специалистом и совместные сессии. Можно начать с бесплатного
            диалога, а можно открыть нужную услугу напрямую.
          </p>
          <div className="soft-products-hero-actions mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/checkin"
              className="soft-button soft-button-primary"
              data-analytics-event="dialogue_cta_clicked"
              data-analytics-target="/checkin"
              data-testid="products-dialogue-cta"
            >
              Начать бесплатно
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/pricing" className="soft-button soft-button-ghost">
              Посмотреть тарифы
            </Link>
          </div>
        </div>
        <aside className="soft-card soft-products-preview" aria-label="Как выбирается продукт">
          <div className="relative">
            <p className="soft-eyebrow">как это работает</p>
            <h2 className="soft-h3 mt-3">Начните бесплатно — углубляйтесь, когда сами захотите</h2>
            <div className="mt-5 grid gap-3">
              {[
                { icon: MessageSquareText, title: "Первый разбор — бесплатно", text: "Расскажите о ситуации, ответьте на пару уточняющих вопросов и сразу получите разбор. Без карты и регистрации." },
                { icon: FileText, title: "Углубитесь, когда захотите", text: "Подробный разбор, полная картина, разбор переписки, расклад Таро или маршрут на 7 дней — открываете только то, что нужно." },
                { icon: HeartHandshake, title: "Перейдите к живой встрече", text: "Когда хочется поддержки человека — психолог, коуч или совместная сессия со специалистом по понятной цене." },
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
