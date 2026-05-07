import { ServiceCatalog } from "@/components/products/service-catalog";

export function AIToolsSection() {
  return (
    <section id="modalities" className="soft-shell py-16 md:py-24">
      <div className="mx-auto mb-10 max-w-3xl text-center">
        <div className="soft-eyebrow">Каталог форматов</div>
        <h2 className="soft-h1 mt-3">
          Углубление под <span className="soft-italic">ваш</span> вопрос
        </h2>
        <p className="soft-lede mt-4">
          Цифровые разборы, маршруты и переход к специалисту открываются как
          продолжение вопроса, а не как витрина ради выбора.
        </p>
      </div>

      <ServiceCatalog />
    </section>
  );
}
