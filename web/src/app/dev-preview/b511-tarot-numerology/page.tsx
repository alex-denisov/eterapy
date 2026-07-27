import Image from "next/image";
import { notFound } from "next/navigation";
import { computeTarotBirthCode } from "@/lib/tarot-birth-code";

export const dynamic = "force-dynamic";

const sections = [
  ["Связь двух арканов", "Умеренность задаёт внешний способ соединять разное, а Иерофант — внутреннюю потребность опираться на смысл и передаваемый опыт."],
  ["Сильное проявление", "Спокойно собирать систему из разрозненных знаний, объяснять сложное понятным языком и выдерживать длинный путь без лишней суеты."],
  ["Теневая сторона", "Откладывать решение в поиске идеальной меры или принимать чужой авторитет за единственно верный ориентир."],
  ["Реализация и деньги", "Лучше всего пара раскрывается там, где нужно соединять людей, знания и процессы, сохраняя ясные правила и человеческий темп."],
];

export default function TarotBirthCardsPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const code = computeTarotBirthCode(3, 3, 1988);
  return (
    <main className="mx-auto w-full max-w-[1120px] px-5 pb-20 pt-10">
      <p className="soft-eyebrow">локальный макет · B511</p>
      <h1 className="soft-h1 mt-2">Арканы судьбы</h1>
      <p className="soft-body mt-2 max-w-2xl">Ваши карты рождения Таро по дате: постоянная пара по системе Tarot Birth Cards, без случайной вытяжки.</p>
      <section className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,.75fr)_minmax(360px,1.25fr)]">
        <div className="grid grid-cols-2 gap-4 rounded-[24px] bg-[var(--soft-paper-card)] p-5 shadow-[0_20px_60px_rgba(91,64,45,.10)]">
          {code.positions.map((position) => (
            <article key={position.key}>
              <Image src={`/tarot/${position.card.code}.jpg`} alt={position.card.name} width={300} height={450} className="aspect-[2/3] w-full rounded-[16px] border border-[var(--soft-paper-edge)] object-cover" />
              <p className="mt-3 font-heading text-lg text-[var(--soft-bordeaux)]">{position.card.name}</p>
              <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">{position.label} · {position.formula}</p>
            </article>
          ))}
        </div>
        <div className="space-y-3">
          <div className="rounded-[20px] bg-[var(--soft-paper-deep)] p-5">
            <p className="soft-eyebrow">прямой ответ</p>
            <p className="mt-2 font-heading text-2xl text-[var(--soft-bordeaux)]">Смену работы стоит делать ради роста мастерства, не только ради ухода от усталости</p>
          </div>
          {sections.map(([heading, body], index) => (
            <details key={heading} open={index === 0} className="rounded-[18px] border border-[var(--soft-paper-edge)] bg-white/60 px-5 py-4">
              <summary className="cursor-pointer font-heading text-lg text-[var(--soft-bordeaux)]">{heading}</summary>
              <p className="soft-body mt-4">{body}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
