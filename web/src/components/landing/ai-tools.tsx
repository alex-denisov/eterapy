import { ServiceCatalog } from "@/components/products/service-catalog";

export function AIToolsSection() {
  return (
    <section id="modalities" className="soft-shell py-16 md:py-24">
      <div className="mx-auto mb-10 max-w-3xl text-center">
        <div className="soft-eyebrow">полный каталог</div>
        <h2 className="soft-h1 mt-3">
          После бесплатного разбора можно <span className="soft-italic">углубиться</span>
        </h2>
        <p className="soft-lede mt-4">
          В каталоге видны все форматы, но первый платный шаг появляется только
          после первичного ответа: один рекомендуемый продукт, альтернативы и
          подписка как опция для тех, кто возвращается.
        </p>
      </div>

      <ServiceCatalog />
    </section>
  );
}
