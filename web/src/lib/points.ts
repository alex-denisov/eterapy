// B365 (M26): единая валюта UI — «баллы». Склонение и форматирование.
// Клиент-безопасный модуль (без db) — можно импортировать в client components.

export function pointsWord(n: number): string {
  const mod10 = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod10 === 1 && mod100 !== 11) return "балл";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "балла";
  return "баллов";
}

export function formatPoints(n: number): string {
  return `${n} ${pointsWord(n)}`;
}
