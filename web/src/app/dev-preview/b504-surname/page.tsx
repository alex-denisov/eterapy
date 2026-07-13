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
  return <section className="soft-product-shell min-h-full">
    <div className="soft-shell mx-auto w-full max-w-2xl py-10 text-[var(--soft-ink)]">
      <p className="soft-eyebrow">локальный макет · B512</p><h1 className="soft-h1 mt-2">Атлас имени: Алексей Рукосуев</h1>
      <p className="soft-body mt-2">Факты и версии отделены от субъективных слоёв. Характер, эмоции и «загадка» показаны как интерпретации звучания, а не как научно доказанные свойства человека.</p>
      <div className="soft-card mt-8 rounded-[24px] p-5"><SurnameLineageVisual story={story} name="Алексей" /></div>
      <div className="mt-5 space-y-3">{SECTIONS.map(([title,text],index)=><details key={title} open={index===0} className="rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-5 py-4"><summary className="cursor-pointer font-heading text-lg text-[var(--soft-bordeaux)]">{title}</summary><p className="soft-body mt-4">{text}</p></details>)}</div>
    </div>
  </section>;
}
