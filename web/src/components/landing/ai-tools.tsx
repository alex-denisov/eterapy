import Link from "next/link";
import { ServiceCatalog } from "@/components/products/service-catalog";

export function AIToolsSection() {
  return (
    <section id="products" className="soft-shell py-16 md:py-24">
      <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div className="max-w-3xl">
          <div className="soft-eyebrow">каталог продуктов</div>
          <h2 className="soft-h1 mt-3">
            Что у нас <span className="soft-italic">есть</span>
          </h2>
          <p className="soft-lede mt-4">
            Цифровые углубления, совместные форматы, эзотерические разборы и встречи со специалистами.
            Можно начать с бесплатного диалога, а можно сразу открыть нужную услугу.
          </p>
        </div>
        <Link href="/products" className="soft-button soft-button-ghost w-fit">
          Все продукты
        </Link>
      </div>

      <ServiceCatalog />
    </section>
  );
}
