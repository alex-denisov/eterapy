import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { PageContainer } from "@/components/ui/page-container";
import { SoftMarkdown } from "@/components/ui/soft-markdown";
import { ResultExportActions } from "@/components/products/result-export-actions";
import { reframeToMarkdown } from "@/lib/reframe-format";
import { loginUrl, appUrl, mainUrl } from "@/lib/subdomain";
import { getProductLabel } from "@/lib/billing-labels";

export const dynamic = "force-dynamic";

// B512 R1-1 (owner 2026-07-15) — страница результата из ЛК обязана выглядеть
// ТОЧНО как оригинальная страница услуги (визуал, источник расчёта, структуры
// расклада). Для всех продуктов с restore-поддержкой редиректим на оригинал;
// generic-рендер ниже остаётся только для форматов без собственной страницы
// (например «итог недели»).

// ?reading=<productResult.id> — символические услуги (use-symbolic-service).
const READING_RESTORE_KEYS = new Set([
  "tarot",
  "natal-chart",
  "numerology",
  "horary",
  "tarot-numerology",
  "family-scenarios",
  "human-design",
  "surname-story",
  "synastry",
]);

// Продукты со своим restore-параметром.
const CUSTOM_RESTORE: Record<string, (id: string) => string> = {
  "deep-report": (id) => `/products/deep-report?resultId=${id}`,
  reframe: (id) => `/products/reframe?resultId=${id}`,
  "chat-analysis": (id) => `/products/chat-analysis?analysis=${id}`,
};

export default async function CabinetResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());
  const userId = session.user.id;
  const canViewAnyResult = ["ADMIN", "SUPERADMIN"].includes(session.user.role ?? "");

  const { id } = await params;
  const result = await db.productResult.findUnique({ where: { id } });

  // 404 if the result does not exist, belongs to someone else, or has been
  // soft-deleted. Resist leaking ownership through the error itself.
  if (!result || (!canViewAnyResult && result.userId !== userId) || result.deletedAt) {
    notFound();
  }

  // Владельца отправляем на оригинальную страницу услуги (полный визуал);
  // админ-просмотр чужого результата остаётся на generic-рендере ниже —
  // restore-эндпоинты услуг отдают только собственные разборы пользователя.
  if (!canViewAnyResult || result.userId === userId) {
    if (READING_RESTORE_KEYS.has(result.productKey)) {
      redirect(mainUrl(`/products/${result.productKey}?reading=${result.id}`));
    }
    const custom = CUSTOM_RESTORE[result.productKey];
    if (custom) redirect(mainUrl(custom(result.id)));
  }

  const productLabel = getProductLabel(result.productKey) || "Результат разбора";
  const isReady = result.status === "READY";
  const rawBody = result.resultText ?? result.previewText ?? "";
  // «Переосмысление» хранится как JSON углов — переводим в markdown, иначе на
  // экране кабинета рендерится сырой JSON (и страница выглядит пустой/сломанной).
  const body = result.productKey === "reframe" ? reframeToMarkdown(rawBody) : rawBody;
  const updatedLabel = new Date(result.updatedAt).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <PageContainer>
      <Link
        href={appUrl("")}
        prefetch={false}
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

      {/* B512 R1-1: «Скачать PDF» (через mainUrl — app-поддомен переписал бы
          /products/print/** в /cabinet/** и давал 404) + «Поделиться»
          (native share / копирование ссылки). «Скачать текстом» убран. */}
      {isReady && body && (
        <ResultExportActions
          resultId={result.id}
          title={result.title}
          shareUrl={appUrl(`/cabinet/results/${result.id}`)}
          className="mt-4"
        />
      )}
    </PageContainer>
  );
}
