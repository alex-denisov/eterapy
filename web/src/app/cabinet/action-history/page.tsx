import type { Prisma } from "@prisma/client";
import { Download, EyeOff, Share2, Trash2 } from "lucide-react";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { listMyMapItems, mergeMapMetadata, type MyMapItemKind } from "@/lib/my-map";
import { dialogueStatusLabelRu } from "@/lib/dialogue-router";
import { SoftMarkdown } from "@/components/ui/soft-markdown";
import { appUrl, loginUrl, mainUrl } from "@/lib/subdomain";

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

export default async function MyMapPage() {
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());

  const items = await listMyMapItems(session.user.id);
  const productCount = items.filter((item) => item.kind === "product").length;
  const routeCount = items.filter((item) => item.kind === "route").length;
  const dialogueCount = items.filter((item) => item.kind === "dialogue").length;
  const recentItem = items[0];
  const activeRoutes = items.filter(i => i.kind === "route");

  return (
    <div className="p-6 md:p-8" data-testid="my-map-page">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <div className="soft-eyebrow">моя карта eterapy</div>
          <h1 className="soft-h1 mt-2">Ваш путь к <span style={{ fontStyle: "italic" }}>ясности</span></h1>
          <p className="mt-2 text-sm max-w-xl" style={{ color: "var(--soft-ink-soft)" }}>
            Личное пространство ваших разборов, инсайтов и маршрутов. Видите только вы.
          </p>
        </div>
        <div className="flex gap-2">
          <span className="soft-badge">🔒 приватный режим</span>
          <a href={appUrl("/api/cabinet/map/export")} className="soft-button soft-button-ghost"
            style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}
            data-analytics-event="my_map_export_clicked"
            data-analytics-surface="my_map"
            data-analytics-target="export">
            <Download className="size-4" />
            Экспорт
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
              <div className="flex gap-3 justify-center mt-4">
                <Link href={mainUrl("/checkin")} className="soft-button soft-button-primary"
                  style={{ minHeight: "2.25rem", padding: "0.5rem 1.25rem", fontSize: "0.875rem" }}>
                  Новый разбор
                </Link>
                <a href={appUrl("/api/cabinet/map/export")} className="soft-button soft-button-ghost"
                  style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}
                  data-analytics-event="my_map_export_clicked"
                  data-analytics-surface="my_map"
                  data-analytics-target="export">
                  <Download className="size-4" />
                  Экспорт
                </a>
              </div>
            </div>
          </div>

          {/* Items list */}
          <div className="soft-eyebrow mb-3">все элементы карты</div>
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
                    <form action={hideMapItem}>
                      <input type="hidden" name="kind" value={item.kind} />
                      <input type="hidden" name="id" value={item.id} />
                      <button type="submit" className="soft-button soft-button-ghost"
                        style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}
                        data-analytics-event="my_map_hide_clicked"
                        data-analytics-surface="my_map"
                        data-analytics-target={item.kind}>
                        <EyeOff className="size-4" />
                        Скрыть
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
