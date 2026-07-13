import { notFound } from "next/navigation";
import { SurnameLineageVisual } from "@/components/products/surname-story-actions";
import { analyzeSurname } from "@/lib/surname-story";

export const dynamic = "force-dynamic";

const SECTIONS = [
  ["Что известно надёжно", "Форма «-ев» закрепляет принадлежность к носителю прозвища. Для фамилии Рукосуев обнаружен сибирский ономастический след; конкретное родство подтверждается только документами семьи."],
  ["Версия происхождения", "Наиболее вероятная версия связывает фамилию с диалектным мирским прозвищем «рукосуй». Это историческая гипотеза о слове, а не характеристика современного носителя."],
  ["Имя + фамилия: характер сочетания", "Алексей смягчает плотный согласный ритм фамилии открытыми гласными. Полная форма звучит собранно и заметно, но не жёстко. Это фоносемантическая гипотеза о восприятии звучания."],
  ["Эмоциональное зеркало", "В полном имени слышится переход от спокойного, знакомого начала к более редкой и фактурной фамилии. Сочетание может создавать впечатление человека, который сначала располагает, а затем запоминается деталью."],
  ["Загадка имени", "Редкая фамилия часто заставляет собеседника мысленно остановиться и переспросить. Её символическая загадка — соединить бытовое происхождение слова с современной индивидуальностью носителя, не превращая этимологию в ярлык."],
  ["Латиница и архивный маршрут", "Для международных документов базовый вариант — Rukosuev. В дореволюционных и миграционных записях стоит проверять варианты Rukosuyev и Rukosueff, затем искать метрические книги, ревизские сказки и семейные документы по подтверждённому месту."],
];

export default function SurnamePreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const story = analyzeSurname("Рукосуев");
  if (!story) return null;
  return <main className="mx-auto w-full max-w-[1120px] px-5 pb-20 pt-10">
    <p className="soft-eyebrow">локальный макет · B504</p><h1 className="soft-h1 mt-2">Паспорт имени: Алексей Рукосуев</h1>
    <p className="soft-body mt-2 max-w-2xl">Факты и версии отделены от субъективных слоёв. Характер, эмоции и «загадка» показаны как интерпретации звучания, а не как научно доказанные свойства человека.</p>
    <section className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="rounded-[24px] border border-[var(--soft-paper-edge)] bg-white/65 p-5"><SurnameLineageVisual story={story}/><div className="mt-4 grid grid-cols-2 gap-3">{[["Латиница","Rukosuev"],["Регион","Сибирь"],["Форма","мирское прозвище"],["Достоверность","версия + след"]].map(([l,v])=><div key={l} className="rounded-2xl bg-[var(--soft-paper-deep)] p-3"><p className="soft-eyebrow text-[.6rem]">{l}</p><p className="mt-1 text-sm text-[var(--soft-bordeaux)]">{v}</p></div>)}</div></div>
      <div className="space-y-3">{SECTIONS.map(([title,text],index)=><details key={title} open={index===0} className="rounded-[18px] border border-[var(--soft-paper-edge)] bg-white/60 px-5 py-4"><summary className="cursor-pointer font-heading text-lg text-[var(--soft-bordeaux)]">{title}</summary><p className="soft-body mt-4">{text}</p></details>)}</div>
    </section>
  </main>;
}
