import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, Sparkles, Download } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { PageContainer } from "@/components/ui/page-container";
import { SoftMarkdown } from "@/components/ui/soft-markdown";
import { loginUrl, appUrl } from "@/lib/subdomain";

const PRODUCT_LABELS: Record<string, string> = {
  "seven-days": "7 дней к ясности",
  "deep-report": "Глубокий отчёт",
  "perspectives": "4 ракурса ответа",
  "compatibility": "Совместимость",
  "tarot": "Расклад Таро",
  "natal-chart": "Натальная карта",
  "synastry": "Синастрия",
  "numerology": "Числовой портрет",
  "my-map": "Расширенная карта",
};

export const dynamic = "force-dynamic";

export default async function CabinetResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());
  const userId = session.user.id;

  const { id } = await params;
  const result = await db.productResult.findUnique({ where: { id } });

  // 404 if the result does not exist, belongs to someone else, or has been
  // soft-deleted. Resist leaking ownership through the error itself.
  if (!result || result.userId !== userId || result.deletedAt) {
    notFound();
  }

  const productLabel = PRODUCT_LABELS[result.productKey] ?? "Результат разбора";
  const isReady = result.status === "READY";
  const body = result.resultText ?? result.previewText ?? "";
  const updatedLabel = new Date(result.updatedAt).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <PageContainer>
      <Link
        href={appUrl("")}
        className="inline-flex items-center gap-2 text-sm text-[var(--soft-ink-faint)] hover:text-[var(--soft-bordeaux)]"
        data-testid="result-back"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        В кабинет
      </Link>

      <section
        className="soft-card mt-4 overflow-hidden p-7 md:p-10"
        data-testid="cabinet-result"
        style={{ background: "linear-gradient(160deg, #FFFCF5 0%, #F4D9C1 100%)" }}
      >
        <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">{productLabel}</p>
        <h1
          className="mt-2 font-heading italic text-[var(--soft-bordeaux)]"
          style={{ fontSize: "clamp(1.75rem, 2.6vw, 2.5rem)", lineHeight: 1.15 }}
        >
          {result.title}
        </h1>
        <p className="mt-3 flex items-center gap-2 text-xs text-[var(--soft-ink-faint)]">
          <Sparkles className="size-3" aria-hidden="true" />
          обновлён {updatedLabel}
        </p>
      </section>

      <section className="soft-card mt-4 p-7" data-testid="cabinet-result-body">
        {isReady ? (
          body ? (
            <SoftMarkdown content={body} className="text-[15px] text-[var(--soft-ink)]" />
          ) : (
            <p className="text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              Отчёт сгенерирован, но текст ещё не загружен — это редкая ситуация. Напишите нам в поддержку
              со ссылкой на эту страницу, и мы откроем доступ к материалу.
            </p>
          )
        ) : (
          <p className="text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Отчёт ещё готовится. Обычно это занимает 1–2 минуты — обновите страницу через пару минут.
          </p>
        )}
      </section>

      {isReady && body && (
        <section className="mt-4 flex flex-wrap gap-3" data-testid="cabinet-result-actions">
          <Link
            href={appUrl("/action-history")}
            className="soft-button soft-button-ghost inline-flex"
          >
            <Sparkles className="size-4" aria-hidden="true" />
            Сохранить в Мою карту
          </Link>
          <a
            href={`data:text/plain;charset=utf-8,${encodeURIComponent(`${result.title}\n\n${body}`)}`}
            download={`${result.title}.txt`}
            className="soft-button soft-button-ghost inline-flex"
          >
            <Download className="size-4" aria-hidden="true" />
            Скачать текстом
          </a>
        </section>
      )}
    </PageContainer>
  );
}
