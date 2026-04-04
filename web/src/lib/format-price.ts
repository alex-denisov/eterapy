export function formatPrice(priceRub: number, durationMin = 60): string {
  const dur = durationMin === 30 ? "30 мин"
    : durationMin === 45 ? "45 мин"
    : durationMin === 60 ? "1 час"
    : durationMin === 90 ? "1.5 часа"
    : durationMin === 120 ? "2 часа"
    : `${durationMin} мин`;
  return `${priceRub.toLocaleString("ru")} ₽ / ${dur}`;
}
