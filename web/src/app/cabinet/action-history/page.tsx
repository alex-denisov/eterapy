import type { Prisma } from "@prisma/client";
import { Download, EyeOff, Map, Share2, Trash2 } from "lucide-react";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { listMyMapItems, mergeMapMetadata, type MyMapItemKind } from "@/lib/my-map";
import { appUrl, loginUrl, mainUrl } from "@/lib/subdomain";

function shareHref(title: string, topic: string) {
  return mainUrl(`/share?from=my-map&topic=${encodeURIComponent(topic)}&title=${encodeURIComponent(title)}`);
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6" data-testid="my-map-page">
      <div className="mb-8 grid gap-5 lg:grid-cols-[1fr_0.75fr] lg:items-end">
        <div>
          <p className="soft-eyebrow">Моя карта ETerapy</p>
          <h1 className="soft-h1 mt-2">Ваш путь к ясности</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Здесь собираются вопросы, сохраненные результаты и маршруты. Можно скрыть лишнее,
            удалить то, что больше не нужно, экспортировать карту или поделиться безопасной карточкой.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Link href={mainUrl("/checkin")} className="soft-button soft-button-primary">
            Новый вопрос
          </Link>
          <a href={appUrl("/api/cabinet/map/export")} className="soft-button soft-button-ghost">
            <Download className="size-4" />
            Экспорт
          </a>
        </div>
      </div>

      <section className="soft-card soft-form-panel mb-6" data-testid="my-map-summary">
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <p className="soft-eyebrow">Всего</p>
            <p className="mt-2 font-heading text-4xl text-[var(--soft-bordeaux)]">{items.length}</p>
          </div>
          <div>
            <p className="soft-eyebrow">Вопросы</p>
            <p className="mt-2 font-heading text-4xl text-[var(--soft-bordeaux)]">{dialogueCount}</p>
          </div>
          <div>
            <p className="soft-eyebrow">Результаты</p>
            <p className="mt-2 font-heading text-4xl text-[var(--soft-bordeaux)]">{productCount}</p>
          </div>
          <div>
            <p className="soft-eyebrow">Маршруты</p>
            <p className="mt-2 font-heading text-4xl text-[var(--soft-bordeaux)]">{routeCount}</p>
          </div>
        </div>
      </section>

      {items.length === 0 ? (
        <section className="soft-card p-8 text-center">
          <Map className="mx-auto size-10 text-[var(--soft-terracotta-dark)]" />
          <h2 className="soft-h3 mt-4">Карта пока пустая</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Начните с вопроса или сохраните готовый результат. Мы покажем только то,
            что помогает вернуться к важным выводам.
          </p>
          <Link href={mainUrl("/checkin")} className="soft-button soft-button-primary mt-5">
            Задать вопрос
          </Link>
        </section>
      ) : (
        <div className="grid gap-3" data-testid="my-map-items">
          {items.map((item) => (
            <article key={`${item.kind}:${item.id}`} className="soft-card p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="soft-chip soft-chip-warm">{item.eyebrow}</span>
                    <span className="soft-chip">{item.status.toLowerCase()}</span>
                    <span className="soft-chip">{item.updatedAt.toLocaleDateString("ru-RU")}</span>
                  </div>
                  <h2 className="mt-3 font-heading text-2xl font-medium text-[var(--soft-ink)]">{item.title}</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">{item.description}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Link href={item.href} className="soft-button soft-button-ghost">
                    Открыть
                  </Link>
                  {item.kind === "product" && (
                    <form action={saveMapItem}>
                      <input type="hidden" name="id" value={item.id} />
                      <button type="submit" className="soft-button soft-button-ghost">Сохранить</button>
                    </form>
                  )}
                  <a href={shareHref(item.title, item.shareTopic)} className="soft-button soft-button-ghost">
                    <Share2 className="size-4" />
                    Поделиться
                  </a>
                  <form action={hideMapItem}>
                    <input type="hidden" name="kind" value={item.kind} />
                    <input type="hidden" name="id" value={item.id} />
                    <button type="submit" className="soft-button soft-button-ghost">
                      <EyeOff className="size-4" />
                      Скрыть
                    </button>
                  </form>
                  <form action={deleteMapItem}>
                    <input type="hidden" name="kind" value={item.kind} />
                    <input type="hidden" name="id" value={item.id} />
                    <button type="submit" className="soft-button soft-button-ghost text-[var(--soft-bordeaux)]">
                      <Trash2 className="size-4" />
                      Удалить
                    </button>
                  </form>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
