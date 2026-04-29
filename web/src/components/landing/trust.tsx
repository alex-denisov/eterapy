import { BadgeCheck, Scale, WalletCards } from "lucide-react";
import { PremiumCard, PremiumSection } from "@/components/v5/premium";

const trustItems = [
  {
    icon: BadgeCheck,
    title: "Трёхуровневая верификация",
    points: [
      "Уровень 1 — подтверждение личности",
      "Уровень 2 — этическая проверка (тест-консультации)",
      "Уровень 3 — репутация из оплаченных сессий",
    ],
    note: "Мы проверяем кто этот человек и как он работает — но не пытаемся проверить предсказательные способности. Честно.",
  },
  {
    icon: Scale,
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
    icon: WalletCards,
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
    <PremiumSection
      className="px-4"
      eyebrow="Доверие"
      title={<>Не слова, а <span className="text-brand-soft-gold">механизмы</span></>}
      lead="Каждый элемент доверия подкреплен системой: проверка, этика, прозрачные платежи."
    >
        <div className="grid gap-4 md:grid-cols-3">
          {trustItems.map((item, index) => (
            <PremiumCard key={item.title} tone={index === 1 ? "lavender" : "gold"} className="p-6">
              <item.icon className="size-6 text-primary" aria-hidden="true" />
              <h3 className="mt-4 font-heading text-2xl font-medium">{item.title}</h3>
              <ul className="mt-4 space-y-2">
                {item.points.map((point) => (
                  <li
                    key={point}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <span className="mt-1 text-primary" aria-hidden="true">•</span>
                    {point}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs italic text-muted-foreground/70">
                {item.note}
              </p>
            </PremiumCard>
          ))}
        </div>
    </PremiumSection>
  );
}
