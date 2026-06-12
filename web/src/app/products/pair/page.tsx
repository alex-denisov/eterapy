import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { CompatibilityActions } from "@/components/products/compatibility-actions";
import { TogetherActions } from "@/components/products/together-actions";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { TOGETHER_SCENARIOS } from "@/lib/together";

export const metadata = createPublicPageMetadata("/products/pair");

type PairSearch = { invite?: string; dialogueId?: string; scenario?: string; via?: string };

export default async function TogetherPage({
  searchParams,
}: {
  searchParams?: Promise<PairSearch>;
}) {
  const search = await searchParams;
  const invite = search?.invite ?? null;
  const isOutsideInvite = search?.via === "outside";
  const scenario = search?.scenario === "compare" ? "compare" : "outside";

  // Invited-guest views skip the hub and render the relevant answer surface.
  if (invite) {
    return (
      <main className="soft-clarity-page soft-public-page" data-testid="together-page">
        <PublicJsonLd route="/products/pair" />
        <section className="soft-shell py-12 md:py-16">
          {isOutsideInvite ? (
            <TogetherActions inviteToken={invite} />
          ) : (
            <CompatibilityActions dialogueId={search?.dialogueId ?? null} inviteToken={invite} productKey="pair" />
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="soft-clarity-page soft-public-page" data-testid="together-page">
      <PublicJsonLd route="/products/pair" />
      <section className="soft-shell py-12 md:py-20">
        <div className="max-w-2xl">
          <p className="soft-eyebrow">вместе</p>
          <h1 className="soft-display mt-4">
            Разобраться <span className="soft-italic">вместе</span>, не теряя границ
          </h1>
          <p className="soft-lede mt-6">
            Один вопрос — несколько взглядов. Выберите формат: позвать кого-то за свежим взглядом,
            сверить взгляды по согласию или посмотреть на совместимость.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3" data-testid="together-scenarios">
          {TOGETHER_SCENARIOS.map((item) => {
            const isActive =
              (item.key === "outside" && scenario === "outside") ||
              (item.key === "compare" && scenario === "compare");
            return (
              <article
                key={item.key}
                className={`soft-card flex flex-col p-6 ${isActive ? "ring-2 ring-[var(--soft-terracotta-dark)]" : ""}`}
                data-testid={`together-scenario-${item.key}`}
              >
                <p className="soft-eyebrow">{item.eyebrow}</p>
                <h2 className="soft-h3 mt-2">{item.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{item.blurb}</p>
                <ul className="mt-4 space-y-1.5 text-sm text-[var(--soft-ink-soft)]">
                  {item.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-2">
                      <span aria-hidden="true" className="text-[var(--soft-terracotta-dark)]">·</span>
                      {bullet}
                    </li>
                  ))}
                </ul>
                <Link
                  href={item.key === "outside" ? "#together-intake" : item.href}
                  className={`soft-button mt-5 w-fit ${isActive ? "soft-button-primary" : "soft-button-ghost"}`}
                >
                  {isActive ? "Выбрано" : "Выбрать формат"}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </article>
            );
          })}
        </div>

        <div className="mt-6 flex gap-2 rounded-[var(--soft-radius-md)] bg-[var(--soft-paper-deep)] p-4 text-sm text-[var(--soft-ink-soft)]">
          <LockKeyhole className="mt-0.5 size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
          <span>Приватные ответы не раскрываются как инструмент давления — общий итог только помогает начать разговор спокойно.</span>
        </div>
      </section>

      <section id="together-intake" className="soft-shell pb-16">
        {scenario === "compare" ? (
          <CompatibilityActions dialogueId={search?.dialogueId ?? null} inviteToken={null} productKey="pair" />
        ) : (
          <TogetherActions inviteToken={null} />
        )}
      </section>
    </main>
  );
}
