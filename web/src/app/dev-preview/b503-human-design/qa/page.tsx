import fs from "node:fs";
import path from "node:path";
import Image from "next/image";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function pngDataUrl(relativePath: string) {
  const absolutePath = path.resolve(process.cwd(), "..", relativePath);
  return `data:image/png;base64,${fs.readFileSync(absolutePath).toString("base64")}`;
}

export default function B503HumanDesignQaPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const reference = pngDataUrl("output/playwright/bodygraph-com-reference-assembly-v2.png");
  const implementation = pngDataUrl("output/mockups/B503-B507/b503-human-design-local-facts.png");

  return (
    <main className="min-h-screen bg-[#151b27] p-5 text-white">
      <div className="grid grid-cols-2 gap-5">
        <section className="min-w-0">
          <h1 className="mb-3 text-sm font-semibold">Референс Bodygraph</h1>
          <div className="overflow-hidden rounded-2xl bg-white">
            <Image className="h-auto w-full" unoptimized src={reference} alt="Референс Bodygraph" width={1960} height={1960} />
          </div>
        </section>
        <section className="min-w-0">
          <h2 className="mb-3 text-sm font-semibold">ETerapy · B503</h2>
          <div className="overflow-hidden rounded-2xl bg-white">
            <Image className="h-auto w-full" unoptimized src={implementation} alt="Локальный макет ETerapy" width={1280} height={1200} />
          </div>
        </section>
      </div>
    </main>
  );
}
