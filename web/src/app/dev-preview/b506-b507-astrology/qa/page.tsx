import fs from "node:fs";
import path from "node:path";
import Image from "next/image";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function pngDataUrl(relativePath: string) {
  const absolutePath = path.resolve(process.cwd(), "..", relativePath);
  return `data:image/png;base64,${fs.readFileSync(absolutePath).toString("base64")}`;
}

const SOURCES = [
  ["Maya SVG · исходная плотность", "output/audits/B503-B507/svgexport-1.svg.png", 1140, 1140],
  ["B506 · сохранённая натальная карта", "output/mockups/B503-B507/b506-natal-maya-local.png", 1280, 1684],
  ["B507 · сохранённая синастрия", "output/mockups/B503-B507/b507-synastry-maya-local.png", 1280, 1684],
] as const;

export default function AstrologyQaPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="min-h-screen bg-[#151b27] p-5 text-white">
      <div className="grid grid-cols-3 gap-5">
        {SOURCES.map(([label, file, width, height]) => (
          <section key={label} className="min-w-0">
            <h1 className="mb-3 text-sm font-semibold">{label}</h1>
            <div className="overflow-hidden rounded-2xl bg-white">
              <Image className="h-auto w-full" unoptimized src={pngDataUrl(file)} alt={label} width={width} height={height} />
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
