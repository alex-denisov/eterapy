const trustItems = [
  {
    icon: "🛡️",
    title: "Трёхуровневая верификация",
    points: [
      "Уровень 1 — подтверждение личности",
      "Уровень 2 — этическая проверка (тест-консультации)",
      "Уровень 3 — репутация из оплаченных сессий",
    ],
    note: "Мы проверяем кто этот человек и как он работает — но не пытаемся проверить предсказательные способности. Честно.",
  },
  {
    icon: "⚖️",
    title: "Этический кодекс",
    points: [
      "Запрет запугивания и манипуляций",
      "Запрет гарантий результатов",
      "Запрет агрессивных допродаж",
      "Запрет контактов вне платформы без согласия",
    ],
    note: "Нарушение: предупреждение → снижение видимости → приостановка → блокировка.",
  },
  {
    icon: "💸",
    title: "Защита денег",
    points: [
      "Фиксированная цена, известна до бронирования",
      "Средства удерживаются до завершения сессии",
      "Возврат при нарушении этического кодекса",
      "Возврат при неявке или техническом сбое",
    ],
    note: "«Не понравилось предсказание» — не основание для возврата. Мы защищаем обе стороны.",
  },
];

export function TrustSection() {
  return (
    <section className="bg-navy-light/50 px-4 py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-heading text-center text-3xl font-bold md:text-4xl">
          Почему нам можно доверять
        </h2>
        <p className="mt-3 text-center text-muted-foreground">
          Не слова — механизмы. Каждый элемент доверия подкреплён системой.
        </p>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {trustItems.map((item) => (
            <div key={item.title} className="rounded-xl border border-border/40 bg-card/30 p-6">
              <span className="text-3xl">{item.icon}</span>
              <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
              <ul className="mt-4 space-y-2">
                {item.points.map((point) => (
                  <li
                    key={point}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <span className="mt-1 text-primary">✦</span>
                    {point}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs italic text-muted-foreground/70">
                {item.note}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
