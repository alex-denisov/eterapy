import { notFound } from "next/navigation";
import { HumanDesignResultView } from "@/components/products/human-design-actions";
import { computeHumanDesign } from "@/lib/human-design";
import { humanDesignSectionHeadings } from "@/lib/human-design-result";

export const dynamic = "force-dynamic";

function previewBody(title: string, chart: ReturnType<typeof computeHumanDesign>) {
  const channel = chart.definedChannels.find((item) => title.includes(item.gates.join("–")));
  const anchors = channel
    ? `В вашей карте это ${title.toLowerCase()}, соединяющий ${channel.centers.map((key) => chart.centers.find((center) => center.key === key)?.name).join(" и ")}.`
    : `Этот раздел опирается на рассчитанные значения: ${chart.typeName}, ${chart.authorityName.toLowerCase()}, профиль ${chart.profile} и ${chart.definition.toLowerCase()}.`;
  return [
    `${anchors} В рамках Human Design это читается как устойчивый механический акцент карты, а не как диагноз или обещание судьбы.`,
    `Практический смысл проявляется в наблюдаемых ситуациях: решениях, темпе действия, ожиданиях других людей и реакции на сопротивление. Для вашего бодиграфа важно не вырывать этот слой отдельно от стратегии «${chart.strategy.toLowerCase()}» и авторитета «${chart.authorityName.toLowerCase()}».`,
    `Проверьте это как небольшой жизненный эксперимент в течение недели: замечайте момент импульса, эмоциональный фон и то, меняется ли определённость после паузы. Записывайте реальные наблюдения, оставляя за собой право не узнавать себя в интерпретации.`,
  ].join("\n\n");
}

export default function B503HumanDesignPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  // Owner reference: 03.03.1988 21:00 Chisinau = 18:00 UTC for this fixture.
  const chart = computeHumanDesign(new Date("1988-03-03T18:00:00.000Z"), true);
  const headings = humanDesignSectionHeadings(chart);
  const resultText = headings.map((title) => `## ${title}\n\n${previewBody(title, chart)}`).join("\n\n");
  const result = {
    id: "b503-local-preview",
    status: "READY",
    title: "Дизайн человека",
    previewText: null,
    resultText,
    saved: true,
    metadata: { generationMetadata: { chart } },
  };

  return (
    <main className="mx-auto w-full max-w-[760px] px-4 pb-16 pt-8">
      <p className="soft-eyebrow">локальный макет · B503</p>
      <h1 className="soft-h1 mt-2">Дизайн человека</h1>
      <p className="soft-body mt-3 rounded-2xl border border-[var(--soft-line)] bg-white/70 p-4 text-sm">
        Нижние строки Chiron и Lilith сознательно не подставлены: для них нужен отдельный
        лицензированный эфемеридный расчёт. Variables показаны отдельно вокруг головы бодиграфа.
      </p>
      <HumanDesignResultView
        result={result}
        recap={{ birth: "03.03.1988, 21:00, Кишинёв" }}
        creditCost={2}
      />
    </main>
  );
}
