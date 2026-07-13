import { notFound } from "next/navigation";
import { DestinyMatrixChart } from "@/components/products/numerology-actions";
import { computeDestinyMatrix } from "@/lib/destiny-matrix";

export const dynamic = "force-dynamic";

export default function MatrixPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const matrix = computeDestinyMatrix(1, 1, 2000);
  return (
    <main className="mx-auto w-full max-w-[1120px] px-5 pb-20 pt-10">
      <p className="soft-eyebrow">локальный макет · B505 · 22 энергии</p>
      <h1 className="soft-h1 mt-2">Матрица судьбы</h1>
      <p className="soft-body mt-2 max-w-2xl">Контрольный расчёт 01.01.2000. Десять позиций, предназначения и карта здоровья показаны как одна система.</p>
      <section className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,.8fr)]">
        <DestinyMatrixChart matrix={matrix} />
        <div className="space-y-3">
          {matrix.zones.map((zone) => (
            <details key={zone.key} open={zone.key === "personality"} className="rounded-[18px] border border-[var(--soft-paper-edge)] bg-white/60 px-5 py-4">
              <summary className="cursor-pointer list-none">
                <span className="flex items-center justify-between gap-4">
                  <span><span className="block font-heading text-lg text-[var(--soft-bordeaux)]">{zone.title}</span><span className="mt-1 block text-xs text-[var(--soft-ink-soft)]">{zone.hint} · в плюсе, в минусе и практики</span></span>
                  <strong className="rounded-full bg-[var(--soft-paper-deep)] px-3 py-2 text-[var(--soft-bordeaux)]">{zone.value}</strong>
                </span>
              </summary>
              <p className="soft-body mt-4">Полный LLM-разбор связывает энергию {zone.value} именно с этой позицией, показывает наблюдаемые проявления и предлагает безопасные практики.</p>
            </details>
          ))}
        </div>
      </section>
      <section className="mt-8 overflow-hidden rounded-[20px] border border-[var(--soft-paper-edge)] bg-white/60">
        <div className="p-4"><h2 className="font-heading text-xl text-[var(--soft-bordeaux)]">Карта здоровья</h2><p className="soft-body text-sm">Символическая карта энергий, не медицинская диагностика.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-[var(--soft-paper-deep)]"><tr>{["Позиция", "Небо", "Земля", "Ключ", "Смысл"].map((heading) => <th key={heading} className="p-3">{heading}</th>)}</tr></thead>
            <tbody>{matrix.health.map((row) => <tr key={row.key} className="border-t border-[var(--soft-paper-edge)]"><th className="p-3">{row.name}</th><td className="p-3">{row.energy}</td><td className="p-3">{row.physical}</td><td className="p-3">{row.emotions}</td><td className="p-3 text-[var(--soft-ink-soft)]">{row.focus}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
