import type { Prisma } from "@prisma/client";
import { BookOpen, Download, Eye, EyeOff, Globe, Lock, Share2, Trash2 } from "lucide-react";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { listMyMapItems, mergeMapMetadata, type MyMapItemKind } from "@/lib/my-map";
import { dialogueStatusLabelRu } from "@/lib/dialogue-router";
import { SoftMarkdown } from "@/components/ui/soft-markdown";
import { appUrl, loginUrl, mainUrl } from "@/lib/subdomain";
import { guardClientCabinet } from "@/lib/cabinet-access";
import { canGrantConsent, canWithdrawConsent, consentBadge, grantConsentPatch, withdrawConsentPatch } from "@/lib/library-consent";

function shareHref(title: string, topic: string) {
  return mainUrl(`/share?from=my-map&topic=${encodeURIComponent(topic)}&title=${encodeURIComponent(title)}`);
}

// T17: map every item status to a Russian label — no raw "answered"/"ready"
// tokens. Dialogue statuses reuse the shared dialogue helper; product/route
// statuses are mapped here.
const MAP_STATUS_LABELS_RU: Record<string, string> = {
  READY: "Готов",
  PROCESSING: "Готовится",
  ACTIVE: "В процессе",
  PAUSED: "На паузе",
  COMPLETED: "Завершён",
  CANCELLED: "Отменён",
  DELETED: "Удалён",
};

function mapItemStatusRu(kind: MyMapItemKind, status: string): string {
  if (kind === "dialogue") return dialogueStatusLabelRu(status);
  return MAP_STATUS_LABELS_RU[status] ?? status.toLowerCase();
}

async function hideMapItem(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());
  const kind = String(formData.get("kind") ?? "") as MyMapItemKind;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  if (kind === "dialogue") {
    const item = await db.dialogue.findFirst({ where: { id, userId: session.user.id, deletedAt: null }, select: { id: true, metadata: true } });
    if (item) await db.dialogue.update({ where: { id: item.id }, data: { metadata: mergeMapMetadata(item.metadata, { hiddenFromMap: true, hiddenFromMapAt: new Date().toISOString() }) } });
  }
  if (kind === "product") {
    const item = await db.productResult.findFirst({ where: { id, userId: session.user.id, deletedAt: null }, select: { id: true, metadata: true } });
    if (item) await db.productResult.update({ where: { id: item.id }, data: { metadata: mergeMapMetadata(item.metadata, { hiddenFromMap: true, hiddenFromMapAt: new Date().toISOString() }) } });
  }
  if (kind === "route") {
    const item = await db.clarityRoute.findFirst({ where: { id, userId: session.user.id, status: { not: "CANCELLED" } }, select: { id: true, metadata: true } });
    if (item) await db.clarityRoute.update({ where: { id: item.id }, data: { metadata: mergeMapMetadata(item.metadata, { hiddenFromMap: true, hiddenFromMapAt: new Date().toISOString() }) } });
  }

  revalidatePath("/cabinet/action-history");
  revalidatePath("/cabinet");
}

// W13: the inverse of hideMapItem — un-hide an item so it returns to the map.
async function unhideMapItem(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());
  const kind = String(formData.get("kind") ?? "") as MyMapItemKind;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  if (kind === "dialogue") {
    const item = await db.dialogue.findFirst({ where: { id, userId: session.user.id, deletedAt: null }, select: { id: true, metadata: true } });
    if (item) await db.dialogue.update({ where: { id: item.id }, data: { metadata: mergeMapMetadata(item.metadata, { hiddenFromMap: false }) } });
  }
  if (kind === "product") {
    const item = await db.productResult.findFirst({ where: { id, userId: session.user.id, deletedAt: null }, select: { id: true, metadata: true } });
    if (item) await db.productResult.update({ where: { id: item.id }, data: { metadata: mergeMapMetadata(item.metadata, { hiddenFromMap: false }) } });
  }
  if (kind === "route") {
    const item = await db.clarityRoute.findFirst({ where: { id, userId: session.user.id, status: { not: "CANCELLED" } }, select: { id: true, metadata: true } });
    if (item) await db.clarityRoute.update({ where: { id: item.id }, data: { metadata: mergeMapMetadata(item.metadata, { hiddenFromMap: false }) } });
  }

  revalidatePath("/cabinet/action-history");
  revalidatePath("/cabinet");
}

async function deleteMapItem(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());
  const kind = String(formData.get("kind") ?? "") as MyMapItemKind;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  if (kind === "dialogue") {
    await db.dialogue.updateMany({
      where: { id, userId: session.user.id, deletedAt: null },
      data: { status: "DELETED", deletedAt: new Date() },
    });
  }
  if (kind === "product") {
    await db.productResult.updateMany({
      where: { id, userId: session.user.id, deletedAt: null },
      data: { status: "DELETED", deletedAt: new Date() },
    });
  }
  if (kind === "route") {
    await db.clarityRoute.updateMany({
      where: { id, userId: session.user.id, status: { not: "CANCELLED" } },
      data: { status: "CANCELLED", metadata: { deletedFromMapAt: new Date().toISOString() } as Prisma.InputJsonObject },
    });
  }

  revalidatePath("/cabinet/action-history");
  revalidatePath("/cabinet");
}

async function saveMapItem(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await db.productResult.updateMany({
    where: { id, userId: session.user.id, status: "READY", deletedAt: null },
    data: { savedAt: new Date() },
  });

  revalidatePath("/cabinet/action-history");
  revalidatePath("/cabinet");
}

// B363 / Механика 12: explicit consent to publish a question in the public
// library. The owner grants consent here (→ moderation queue); without it a
// question is never published. Strict gating lives in lib/library-consent.ts.
async function grantLibraryConsent(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const patch = grantConsentPatch();
  await db.dialogue.updateMany({
    // Owner-scoped: a user can only consent to publish their OWN question.
    where: { id, userId: session.user.id, deletedAt: null },
    data: { libraryConsentAt: patch.libraryConsentAt, libraryStatus: patch.libraryStatus },
  });

  revalidatePath("/cabinet/action-history");
}

async function withdrawLibraryConsent(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const patch = withdrawConsentPatch();
  await db.dialogue.updateMany({
    where: { id, userId: session.user.id, deletedAt: null },
    data: { libraryConsentAt: patch.libraryConsentAt, libraryStatus: patch.libraryStatus },
  });

  revalidatePath("/cabinet/action-history");
}

export default async function MyMapPage({ searchParams }: { searchParams: Promise<{ showHidden?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());
  guardClientCabinet(session.user.role); // Y6: client-only surface

  const { showHidden } = await searchParams;
  const wantHidden = showHidden === "1";
  // W13: fetch everything (incl. hidden) so we know the hidden count, then show
  // hidden items only when the user asked to ("показать скрытые").
  const allItems = await listMyMapItems(session.user.id, { includeHidden: true });
  const hiddenCount = allItems.filter((item) => item.hidden).length;
  const items = wantHidden ? allItems : allItems.filter((item) => !item.hidden);
  const productCount = items.filter((item) => item.kind === "product").length;
  const routeCount = items.filter((item) => item.kind === "route").length;
  const dialogueCount = items.filter((item) => item.kind === "dialogue").length;
  const recentItem = items[0];
  const activeRoutes = items.filter(i => i.kind === "route");
  const dialogueTopicCounts = new Map<string, { value: string; label: string; count: number }>();
  for (const item of items) {
    if (item.kind !== "dialogue" || !item.topic || !item.topicLabel) continue;
    const current = dialogueTopicCounts.get(item.topic);
    dialogueTopicCounts.set(item.topic, {
      value: item.topic,
      label: item.topicLabel,
      count: (current?.count ?? 0) + 1,
    });
  }
  const dialogueTopics = Array.from(dialogueTopicCounts.values())
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ru"))
    .slice(0, 8);

  return (
    <div className="p-6 md:p-8" data-testid="my-map-page">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <div className="soft-eyebrow">моя карта eterapy</div>
          <h1 className="soft-h1 mt-2">Ваш путь — <span style={{ fontStyle: "italic" }}>на одной карте</span></h1>
          <p className="mt-2 text-sm max-w-xl" style={{ color: "var(--soft-ink-soft)" }}>
            Личное пространство ваших разборов, инсайтов и маршрутов. Видите только вы.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* X15: «Приватно» (lock) — no implication of a non-existent public mode */}
          <span className="soft-badge inline-flex items-center gap-1"><Lock className="size-3" aria-hidden="true" /> Приватно</span>
          {/* X16: export demoted to a subtle icon-only control — it's a rare action,
              no longer a prominent ghost button competing in the header. */}
          <a href={appUrl("/api/cabinet/map/export")}
            className="inline-flex size-9 items-center justify-center rounded-md text-[var(--soft-ink-faint)] transition-colors hover:bg-[var(--soft-paper-deep)] hover:text-[var(--soft-ink)]"
            title="Экспортировать карту"
            aria-label="Экспортировать карту"
            data-analytics-event="my_map_export_clicked"
            data-analytics-surface="my_map"
            data-analytics-target="export">
            <Download className="size-4" />
          </a>
          <Link href={mainUrl("/checkin")} className="soft-button soft-button-primary"
            style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}>
            Новый разбор
          </Link>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="soft-card p-12 text-center">
          <h2 className="soft-h3">Карта пока пустая</h2>
          <p className="mt-3 max-w-md mx-auto text-sm" style={{ color: "var(--soft-ink-soft)" }}>
            Начните с вопроса или сохраните готовый результат. Мы покажем только то,
            что помогает вернуться к важным выводам.
          </p>
          <Link href={mainUrl("/checkin")} className="soft-button soft-button-primary mt-6">
            Начать диалог
          </Link>
        </div>
      ) : (
        <>
          {dialogueTopics.length > 0 && (
            <section className="soft-card mb-6 p-5 md:p-6" data-testid="my-map-dialogue-topics">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="soft-eyebrow">темы из ваших диалогов</div>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                    Карта собирает темы из сохранённых вопросов, чтобы история была живой, а не моковой витриной.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  {dialogueTopics.map((topic) => (
                    <span key={topic.value} className="soft-chip" data-topic-key={topic.value}>
                      {topic.label}
                      <span className="text-xs opacity-60">{topic.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Bento map grid */}
          <div className="soft-map-grid mb-8">
            {/* Central insight — span 8 */}
            <div className="soft-map-tile col-span-12 md:col-span-8 p-10"
              style={{ background: "linear-gradient(140deg, #FFFCF5, #F4D9C1, #E8C4B8)" }}>
              <div className="soft-eyebrow">последний разбор</div>
              {recentItem ? (
                <>
                  <div className="mt-3" style={{ fontFamily: "var(--font-heading)", fontStyle: "italic", fontSize: "clamp(1.4rem, 2.5vw, 2rem)", lineHeight: 1.25, color: "var(--soft-bordeaux)", maxWidth: 520 }}>
                    {recentItem.title}
                  </div>
                  {recentItem.bodyMarkdown ? (
                    <SoftMarkdown
                      content={recentItem.bodyMarkdown.slice(0, 520)}
                      className="mt-3 text-sm"
                    />
                  ) : recentItem.description ? (
                    <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)", maxWidth: 460 }}>
                      {recentItem.description.slice(0, 160)}{recentItem.description.length > 160 ? "..." : ""}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-3 mt-6">
                    {/* Eyebrow chip: bordeaux fill so the category never blends
                        into the warm tile gradient. */}
                    <span
                      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
                      style={{ background: "var(--soft-bordeaux)", color: "#FBF0E1" }}
                    >
                      {recentItem.eyebrow}
                    </span>
                    {/* Primary action: terracotta button stands clearly apart
                        from the cream/apricot tile (was a near-invisible chip). */}
                    <Link
                      href={recentItem.href}
                      className="soft-button soft-button-primary"
                      style={{ minHeight: "2.25rem", padding: "0.5rem 1.1rem", fontSize: "0.875rem" }}
                    >
                      Открыть разбор →
                    </Link>
                  </div>
                </>
              ) : (
                <div className="mt-3" style={{ fontFamily: "var(--font-heading)", fontStyle: "italic", fontSize: "1.5rem", color: "var(--soft-bordeaux)" }}>
                  Ваши инсайты появятся здесь
                </div>
              )}
            </div>

            {/* Stats — span 4 */}
            <div className="soft-map-tile col-span-12 md:col-span-4 p-6" style={{ background: "var(--soft-bordeaux)", color: "#FBF0E1" }}>
              <div className="soft-eyebrow" style={{ color: "#E8C4B8" }}>статистика</div>
              <div className="mt-4 space-y-4">
                {[
                  ["Вопросов", dialogueCount],
                  ["Углублений", productCount],
                  ["Маршрутов", routeCount],
                ].map(([label, count]) => (
                  <div key={String(label)} className="flex items-baseline justify-between" style={{ borderBottom: "1px solid rgba(232,196,184,0.2)", paddingBottom: "12px" }}>
                    <span style={{ fontSize: 14, color: "#E8C4B8" }}>{label}</span>
                    <span style={{ fontFamily: "var(--font-heading)", fontSize: 28, fontWeight: 600, color: "#FBF0E1" }}>{count}</span>
                  </div>
                ))}
                <div className="flex items-baseline justify-between">
                  <span style={{ fontSize: 14, color: "#E8C4B8" }}>Всего</span>
                  <span style={{ fontFamily: "var(--font-heading)", fontSize: 36, fontWeight: 600, color: "#FBF0E1" }}>{items.length}</span>
                </div>
              </div>
            </div>

            {/* T17: the "недавние разборы" tile was removed — it duplicated the
                full "все элементы карты" list below (and the cabinet home already
                carries its own recent-analyses block). The map view now leads
                with the latest insight + stats, then the complete item list. */}

            {/* T11: "маршруты в работе" + "следующий шаг" now always fill the
                full 12-col row. When active routes exist they split 6/6; when
                there are none, "следующий шаг" spans the whole row so the line
                never leaves an empty gap where the old third tile used to be. */}
            {activeRoutes.length > 0 && (
              <div className="soft-map-tile col-span-12 md:col-span-6 p-6">
                <div className="soft-eyebrow">маршруты в работе</div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {activeRoutes.slice(0, 2).map(route => (
                    <div key={route.id}>
                      <div style={{ fontFamily: "var(--font-heading)", fontSize: 17, color: "var(--soft-bordeaux)", fontWeight: 500 }}>
                        {route.title}
                      </div>
                      <Link href={route.href} className="soft-chip mt-2 inline-flex">
                        Продолжить →
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommend / CTA — fills the rest of the row */}
            <div className={`soft-map-tile col-span-12 p-6 ${activeRoutes.length > 0 ? "md:col-span-6" : "md:col-span-12"}`}
              style={{ background: "linear-gradient(140deg, #DBD3EA, #E8E1F2)", color: "#4A3E5E" }}>
              <div className="soft-eyebrow" style={{ color: "#6B5C82" }}>следующий шаг</div>
              <div className={activeRoutes.length > 0 ? "" : "flex flex-col gap-3 md:flex-row md:items-center md:justify-between"}>
                <p className="mt-3 text-sm" style={{ fontFamily: "var(--font-heading)", fontSize: "1.1rem", lineHeight: 1.4, color: "#3A2E58", maxWidth: 560 }}>
                  Продолжайте исследовать — каждый разбор делает карту точнее.
                </p>
                <Link href={mainUrl("/checkin")} className="soft-button soft-button-primary mt-4 md:mt-0 shrink-0"
                  style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}>
                  Новый разбор
                </Link>
              </div>
            </div>

            {/* Bottom CTA */}
            <div className="soft-map-tile col-span-12 p-8 text-center"
              style={{ background: "var(--soft-paper-deep)", border: "1px dashed var(--soft-paper-edge)" }}>
              <div style={{ fontFamily: "var(--font-heading)", fontStyle: "italic", fontSize: 20, color: "var(--soft-ink-soft)" }}>
                Карта обновляется автоматически после каждого разбора. Видите только вы.
              </div>
              {/* W15: the export action already lives once in the page header —
                  no need to repeat it mid-screen. */}
              <div className="flex gap-3 justify-center mt-4">
                <Link href={mainUrl("/checkin")} className="soft-button soft-button-primary"
                  style={{ minHeight: "2.25rem", padding: "0.5rem 1.25rem", fontSize: "0.875rem" }}>
                  Новый разбор
                </Link>
              </div>
            </div>
          </div>

          {/* Items list */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="soft-eyebrow">{wantHidden ? "скрытые элементы" : "все элементы карты"}</div>
            {/* W13: "Скрыть" persists a hidden flag; this toggle reveals them and
                lets the user un-hide. Shown only when something is hidden. */}
            {hiddenCount > 0 && (
              <a
                href={wantHidden ? appUrl("/action-history") : appUrl("/action-history?showHidden=1")}
                className="soft-button soft-button-ghost"
                style={{ minHeight: "2rem", padding: "0.375rem 0.75rem", fontSize: "0.8125rem" }}
              >
                {wantHidden ? "← Показать активные" : `Показать скрытые (${hiddenCount})`}
              </a>
            )}
          </div>
          {/* T12: single-column cards — meta chips → title → full-width body →
              actions footer. The previous two-column flex squeezed the prose
              into a narrow track, so long unbroken tokens (chat-analysis
              разбор, links) overflowed and looked clipped/unreadable. Body now
              spans the whole card width with break-words so every разбор
              renders cleanly, with a description fallback so a card is never
              left with an empty body. */}
          <div className="grid gap-3" data-testid="my-map-items">
            {items.map((item) => {
              const previewBody = item.bodyMarkdown?.trim();
              return (
                <article key={`${item.kind}:${item.id}`} className="soft-card flex flex-col gap-4 p-5 md:p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="soft-chip soft-chip-warm">{item.eyebrow}</span>
                    {item.topicLabel && <span className="soft-chip" data-topic-key={item.topic}>{item.topicLabel}</span>}
                    <span className="soft-chip">{mapItemStatusRu(item.kind, item.status)}</span>
                    <span className="soft-chip">{item.updatedAt.toLocaleDateString("ru-RU")}</span>
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-heading text-xl font-medium break-words" style={{ color: "var(--soft-ink)" }}>{item.title}</h2>
                    {previewBody ? (
                      <SoftMarkdown
                        content={previewBody.slice(0, 460)}
                        className="mt-2 break-words [overflow-wrap:anywhere]"
                      />
                    ) : (
                      <p className="mt-2 break-words text-sm leading-relaxed [overflow-wrap:anywhere]" style={{ color: "var(--soft-ink-soft)" }}>{item.description}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-[var(--soft-paper-edge)] pt-4">
                    <Link href={item.href} className="soft-button soft-button-primary"
                      style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}>
                      Открыть
                    </Link>
                    {item.kind === "product" && (
                      <form action={saveMapItem}>
                        <input type="hidden" name="id" value={item.id} />
                        <button type="submit" className="soft-button soft-button-ghost"
                          style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}>
                          Сохранить
                        </button>
                      </form>
                    )}
                    <a href={shareHref(item.title, item.shareTopic)} className="soft-button soft-button-ghost"
                      style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}
                      data-analytics-event="my_map_share_clicked"
                      data-analytics-surface="my_map"
                      data-analytics-target={item.kind}>
                      <Share2 className="size-4" />
                      Поделиться
                    </a>
                    {/* B363 / Механика 12: owner consent to publish this
                        question in the public library. Без согласия вопрос не
                        публикуется. The consent is anonymized + moderated before
                        it ever appears publicly, and can be withdrawn anytime. */}
                    {item.kind === "dialogue" && (() => {
                      const consent = { libraryConsentAt: item.libraryConsentAt ?? null, libraryStatus: item.libraryStatus ?? null };
                      const badge = consentBadge(consent);
                      if (canGrantConsent(consent)) {
                        return (
                          <form action={grantLibraryConsent}>
                            <input type="hidden" name="id" value={item.id} />
                            <button type="submit" className="soft-button soft-button-ghost"
                              style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}
                              title="Анонимно опубликовать этот вопрос в библиотеке. Перед публикацией он проходит модерацию, согласие можно отозвать в любой момент."
                              data-analytics-event="my_map_library_consent_granted"
                              data-analytics-surface="my_map"
                              data-analytics-target="dialogue">
                              <BookOpen className="size-4" />
                              Опубликовать в библиотеке
                            </button>
                          </form>
                        );
                      }
                      return (
                        <span className="inline-flex items-center gap-2">
                          <span className={`soft-chip ${badge.tone === "published" ? "soft-chip-warm" : ""}`}>
                            <Globe className="size-3" aria-hidden="true" />
                            {badge.label}
                          </span>
                          {canWithdrawConsent(consent) && (
                            <form action={withdrawLibraryConsent}>
                              <input type="hidden" name="id" value={item.id} />
                              <button type="submit" className="soft-button soft-button-ghost"
                                style={{ minHeight: "2.25rem", padding: "0.5rem 0.75rem", fontSize: "0.8125rem" }}
                                title="Отозвать согласие — вопрос не будет опубликован."
                                data-analytics-event="my_map_library_consent_withdrawn"
                                data-analytics-surface="my_map"
                                data-analytics-target="dialogue">
                                Убрать
                              </button>
                            </form>
                          )}
                        </span>
                      );
                    })()}
                    <form action={item.hidden ? unhideMapItem : hideMapItem}>
                      <input type="hidden" name="kind" value={item.kind} />
                      <input type="hidden" name="id" value={item.id} />
                      <button type="submit" className="soft-button soft-button-ghost"
                        style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}
                        data-analytics-event={item.hidden ? "my_map_unhide_clicked" : "my_map_hide_clicked"}
                        data-analytics-surface="my_map"
                        data-analytics-target={item.kind}>
                        {item.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                        {item.hidden ? "Показать" : "Скрыть"}
                      </button>
                    </form>
                    <form action={deleteMapItem} className="ml-auto">
                      <input type="hidden" name="kind" value={item.kind} />
                      <input type="hidden" name="id" value={item.id} />
                      <button type="submit" className="soft-button soft-button-ghost"
                        style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem", color: "var(--soft-bordeaux)" }}
                        data-analytics-event="my_map_delete_clicked"
                        data-analytics-surface="my_map"
                        data-analytics-target={item.kind}>
                        <Trash2 className="size-4" />
                        Удалить
                      </button>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
