import { notFound } from "next/navigation";
import { SurnameLineageVisual } from "@/components/products/surname-origin-actions";
import { analyzeSurname, computeSurnameCode } from "@/lib/surname-story";

export const dynamic = "force-dynamic";

const SECTIONS = [
  ["Главный ресурс рода", "В плюсе — способность начинать и задавать направление. В минусе — давление на близких и привычка считать помощь слабостью. Проверка: замечаете ли вы, что соглашаетесь на сотрудничество только после попытки справиться в одиночку? Практика: в течение 14 дней заранее распределять одну важную задачу, а не спасать её в последний момент."],
  ["Родовая тень", "Теневая сторона проявляется не как «плохая фамилия», а как повторяемая стратегия: контроль вместо доверия, победа вместо переговоров, молчание вместо просьбы. Цена — лишняя нагрузка и конфликты там, где нужен был договор."],
  ["Деньги и реализация", "Код показывает символический способ обращаться с видимостью, риском и обменом ценностью, а не гарантированный уровень дохода. Смена варианта усиливает партнёрскую подачу, но может ослабить резкость личного авторства — это и есть цена перехода."],
  ["Отношения, границы и семейная роль", "В семейной системе код читается как склонность занимать роль организатора. В плюсе это надёжность; в минусе — незаметное присвоение чужой ответственности. Практика: один раз в неделю прямо спрашивать, кому на самом деле принадлежит решение."],
];

export default function SurnamePreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const story = analyzeSurname("Романова");
  const comparison = computeSurnameCode("Волкова");
  if (!story) return null;
  return <section className="soft-product-shell min-h-full">
    <div className="soft-shell mx-auto w-full max-w-3xl py-10 text-[var(--soft-ink)]">
      <p className="soft-eyebrow">локальный макет · B515</p><h1 className="soft-h1 mt-2">Кармический аудит рода</h1>
      <p className="soft-body mt-2">Сравнение фамилий Романова → Волкова: одна видимая формула, два числовых кода и два Старших Аркана. Расчёт показан как факт системы, а характер и семейные сценарии — как проверяемая эзотерическая интерпретация.</p>
      <div className="soft-card mt-8 rounded-[24px] p-5"><SurnameLineageVisual story={story} comparison={comparison} mode="change" /></div>
      <div className="mt-5 space-y-3">{SECTIONS.map(([title,text],index)=><details key={title} open={index===0} className="rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-5 py-4"><summary className="cursor-pointer font-heading text-lg text-[var(--soft-bordeaux)]">{title}</summary><p className="soft-body mt-4">{text}</p></details>)}</div>
    </div>
  </section>;
}
