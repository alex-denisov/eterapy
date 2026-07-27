import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getProductLabel } from "@/lib/billing-labels";
import { reframeToMarkdown } from "@/lib/reframe-format";
import { MiniAppResultScreen } from "@/components/miniapp/result-screen";

export const dynamic = "force-dynamic";

const READING_RESTORE_KEYS = new Set([
  "tarot", "natal-chart", "numerology", "horoscope", "arcana",
  "family-questions", "human-design", "surname-origin", "compatibility-by-date",
]);

const CUSTOM_RESTORE: Record<string, (id: string) => string> = {
  "deep-report": (id) => `/miniapp/products/deep-report?resultId=${encodeURIComponent(id)}`,
  reframe: (id) => `/miniapp/products/reframe?resultId=${encodeURIComponent(id)}`,
  "chat-analysis": (id) => `/miniapp/products/chat-analysis?analysis=${encodeURIComponent(id)}`,
};

export default async function MiniAppResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/miniapp/account?mode=login&intent=open-result&returnTo=${encodeURIComponent(`/miniapp/results/${id}`)}`);
  const result = await db.productResult.findUnique({ where: { id } });
  const canViewAnyResult = ["ADMIN", "SUPERADMIN"].includes(session.user.role ?? "");
  if (!result || (!canViewAnyResult && result.userId !== session.user.id) || result.deletedAt) notFound();

  if (!canViewAnyResult || result.userId === session.user.id) {
    if (READING_RESTORE_KEYS.has(result.productKey)) redirect(`/miniapp/products/${result.productKey}?reading=${encodeURIComponent(result.id)}`);
    const restore = CUSTOM_RESTORE[result.productKey];
    if (restore) redirect(restore(result.id));
  }

  const raw = result.resultText ?? result.previewText ?? "";
  const body = result.productKey === "reframe" ? reframeToMarkdown(raw) : raw;
  return (
    <MiniAppResultScreen
      title={result.title}
      label={getProductLabel(result.productKey) || "Результат разбора"}
      body={body}
      ready={result.status === "READY"}
      updated={new Date(result.updatedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
    />
  );
}
