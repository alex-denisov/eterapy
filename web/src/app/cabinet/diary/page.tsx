import type { Prisma } from "@prisma/client";
import { BookOpen, Eye, EyeOff, Globe, Share2, Trash2 } from "lucide-react";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { listDiaryItems, mergeDiaryMetadata, type DiaryItemKind } from "@/lib/diary";
import { dialogueStatusLabelRu } from "@/lib/dialogue-router";
import { dailyCardBeats, getOrCreateDailyCard } from "@/lib/daily-card";
import { practiceWeekDays, startOfPracticeWeek } from "@/lib/weekly-summary";
import { getPracticeStreakSnapshot } from "@/lib/streaks";
import { listJournalEntries, type JournalEntry } from "@/lib/journal-entries";
import { topObservation } from "@/lib/diary-recommendation";
import { deepeningForTopic } from "@/lib/cabinet-recommendations";
import { DailyPracticeActions } from "@/components/cabinet/daily-practice-actions";
import { DiaryPinControl } from "@/components/cabinet/diary-pin-control";
import { RevealList } from "@/components/cabinet/reveal-list";
import { appUrl, loginUrl, mainUrl } from "@/lib/subdomain";
import { guardClientCabinet } from "@/lib/cabinet-access";
import { DiaryPinGate } from "@/components/cabinet/diary-pin-gate";
import { canGrantConsent, canWithdrawConsent, consentBadge, grantConsentPatch, withdrawConsentPatch } from "@/lib/library-consent";

function shareHref(title: string, topic: string) {
  return mainUrl(`/share?from=diary&topic=${encodeURIComponent(topic)}&title=${encodeURIComponent(title)}`);
}

// T17: map every item status to a Russian label — no raw "answered"/"ready".
const MAP_STATUS_LABELS_RU: Record<string, string> = {
  READY: "Готов",
  PROCESSING: "Готовится",
  ACTIVE: "В процессе",
  PAUSED: "На паузе",
  COMPLETED: "Завершён",
  CANCELLED: "Отменён",
  DELETED: "Удалён",
};

function mapItemStatusRu(kind: DiaryItemKind, status: string): string {
  if (kind === "dialogue") return dialogueStatusLabelRu(status);
  return MAP_STATUS_LABELS_RU[status] ?? status.toLowerCase();
}

// B464 IB2: one journaling-history entry (question + expandable взгляд/шаг).
function JournalEntryCard({ entry }: { entry: JournalEntry }) {
  const hasBeats = Boolean(entry.perspective || entry.step);
  return (
    <details className="rounded-[14px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4" data-testid="diary-journal-entry">
      <summary className="cursor-pointer list-none">
        <span className="text-[11.5px]" style={{ color: "var(--soft-ink-faint)" }}>
          {entry.date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} · {entry.own ? "ваш вопрос" : "вопрос дня"}
        </span>
        <p className="soft-italic mt-1" style={{ fontSize: 16, color: "var(--soft-bordeaux)", lineHeight: 1.4 }}>«{entry.question}»</p>
        {hasBeats && (
          <span className="mt-1.5 inline-block text-[12.5px]" style={{ color: "var(--soft-ink-faint)" }}>посмотреть взгляд и шаг ↓</span>
        )}
      </summary>
      {hasBeats && (
        <div className="mt-3 space-y-3 border-t border-[var(--soft-paper-edge)] pt-3">
          {entry.perspective && (
            <div>
              <p className="soft-eyebrow">взгляд дня</p>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>{entry.perspective}</p>
            </div>
          )}
          {entry.step && (
            <div>
              <p className="soft-eyebrow">маленький шаг</p>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>{entry.step}</p>
            </div>
          )}
        </div>
      )}
    </details>
  );
}

async function hideMapItem(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());
  const kind = String(formData.get("kind") ?? "") as DiaryItemKind;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  if (kind === "dialogue") {
    const item = await db.dialogue.findFirst({ where: { id, userId: session.user.id, deletedAt: null }, select: { id: true, metadata: true } });
    if (item) await db.dialogue.update({ where: { id: item.id }, data: { metadata: mergeDiaryMetadata(item.metadata, { hiddenFromMap: true, hiddenFromMapAt: new Date().toISOString() }) } });
  }
  if (kind === "product") {
    const item = await db.productResult.findFirst({ where: { id, userId: session.user.id, deletedAt: null }, select: { id: true, metadata: true } });
    if (item) await db.productResult.update({ where: { id: item.id }, data: { metadata: mergeDiaryMetadata(item.metadata, { hiddenFromMap: true, hiddenFromMapAt: new Date().toISOString() }) } });
  }
  if (kind === "route") {
    const item = await db.clarityRoute.findFirst({ where: { id, userId: session.user.id, status: { not: "CANCELLED" } }, select: { id: true, metadata: true } });
    if (item) await db.clarityRoute.update({ where: { id: item.id }, data: { metadata: mergeDiaryMetadata(item.metadata, { hiddenFromMap: true, hiddenFromMapAt: new Date().toISOString() }) } });
  }

  revalidatePath("/cabinet/diary");
  revalidatePath("/cabinet");
}

// W13: the inverse of hideMapItem — un-hide an item so it returns to the map.
async function unhideMapItem(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());
  const kind = String(formData.get("kind") ?? "") as DiaryItemKind;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  if (kind === "dialogue") {
    const item = await db.dialogue.findFirst({ where: { id, userId: session.user.id, deletedAt: null }, select: { id: true, metadata: true } });
    if (item) await db.dialogue.update({ where: { id: item.id }, data: { metadata: mergeDiaryMetadata(item.metadata, { hiddenFromMap: false }) } });
  }
  if (kind === "product") {
    const item = await db.productResult.findFirst({ where: { id, userId: session.user.id, deletedAt: null }, select: { id: true, metadata: true } });
    if (item) await db.productResult.update({ where: { id: item.id }, data: { metadata: mergeDiaryMetadata(item.metadata, { hiddenFromMap: false }) } });
  }
  if (kind === "route") {
    const item = await db.clarityRoute.findFirst({ where: { id, userId: session.user.id, status: { not: "CANCELLED" } }, select: { id: true, metadata: true } });
    if (item) await db.clarityRoute.update({ where: { id: item.id }, data: { metadata: mergeDiaryMetadata(item.metadata, { hiddenFromMap: false }) } });
  }

  revalidatePath("/cabinet/diary");
  revalidatePath("/cabinet");
}

async function deleteMapItem(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());
  const kind = String(formData.get("kind") ?? "") as DiaryItemKind;
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

  revalidatePath("/cabinet/diary");
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

  revalidatePath("/cabinet/diary");
  revalidatePath("/cabinet");
}

// B363 / Механика 12: explicit consent to publish a question in the public
// library. Без согласия вопрос никогда не публикуется.
async function grantLibraryConsent(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const patch = grantConsentPatch();
  await db.dialogue.updateMany({
    where: { id, userId: session.user.id, deletedAt: null },
    data: { libraryConsentAt: patch.libraryConsentAt, libraryStatus: patch.libraryStatus },
  });

  revalidatePath("/cabinet/diary");
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

  revalidatePath("/cabinet/diary");
}

// round-4 #12: build /diary hrefs preserving the active topic filter and the
// hidden toggle together.
function diaryHref({ topic, hidden }: { topic?: string | null; hidden?: boolean }): string {
  const params = new URLSearchParams();
  if (hidden) params.set("showHidden", "1");
  if (topic) params.set("topic", topic);
  const qs = params.toString();
  return appUrl(`/diary${qs ? `?${qs}` : ""}`);
}

function familyCountWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "раз";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "раза";
  return "раз";
}

export default async function MyMapPage({ searchParams }: { searchParams: Promise<{ showHidden?: string; pin?: string; topic?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());
  guardClientCabinet(session.user.role); // Y6: client-only surface
  const userId = session.user.id;

  const { showHidden, pin, topic: topicParam } = await searchParams;
  const wantHidden = showHidden === "1";
  // B464 round-4 #8: the sidebar lock deep-links straight into the PIN setup.
  const autoOpenPin = pin === "setup";

  const [allItems, dailyCardResult, weekCards, practiceStreak, journalEntries] = await Promise.all([
    listDiaryItems(userId, { includeHidden: true }),
    getOrCreateDailyCard(userId),
    db.dailyCard.findMany({
      where: { userId, completedAt: { not: null }, cardDate: { gte: startOfPracticeWeek() } },
      select: { cardDate: true },
    }),
    getPracticeStreakSnapshot(userId),
    listJournalEntries(userId, 30),
  ]);

  const hiddenCount = allItems.filter((item) => item.hidden).length;
  const visibleItems = wantHidden ? allItems : allItems.filter((item) => !item.hidden);
  // round-4 #12: the topic chips FILTER the list. A topic filter shows the
  // dialogue разборы of that theme (products/routes carry no topic).
  const activeTopic = topicParam?.trim() || null;
  const items = activeTopic
    ? visibleItems.filter((item) => item.kind === "dialogue" && item.topic === activeTopic)
    : visibleItems;

  // Chips count from the UNFILTERED list so a picked topic keeps all chips visible.
  const dialogueTopicCounts = new Map<string, { value: string; label: string; count: number }>();
  for (const item of visibleItems) {
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

  const topicCountRecord: Record<string, number> = {};
  for (const [key, value] of dialogueTopicCounts) topicCountRecord[key] = value.count;
  const observation = topObservation(topicCountRecord);
  const familyCount = dialogueTopicCounts.get("family")?.count ?? 0;

  const dailyCard = dailyCardResult.card;
  const diaryBeats = dailyCardBeats(dailyCard.metadata);
  // round-4 #12: the observation is informational — but it offers one gentle,
  // optional action matched to the theme (the Triage deepening).
  const observationOffer = observation
    ? deepeningForTopic(observation.topic, dialogueTopicCounts.get("family")?.count ?? 0)
    : null;

  return (
    <DiaryPinGate>
    <div className="p-6 md:p-8" data-testid="diary-page">
      {/* Header — PIN set/disable (round-2 #4) replaces the «Приватно» badge. */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="soft-eyebrow">дневник</div>
          <h1 className="soft-h1 mt-2">Ваше <span style={{ fontStyle: "italic" }}>пространство</span></h1>
          <p className="mt-2 max-w-xl text-sm" style={{ color: "var(--soft-ink-soft)" }}>
            Личное пространство ваших вопросов, разборов и заметок. Видите только вы.
          </p>
        </div>
        {/* round-4 #9/#10: ONE PIN control (modal), and no duplicate «Задать
            вопрос» — the header CTA already carries that action. */}
        <DiaryPinControl autoOpen={autoOpenPin} />
      </div>

      {/* Habit hero — the /practice reflect flow + week strip + streak ring. */}
      <section
        className="soft-card mb-4 p-5 md:p-6"
        data-testid="diary-habit-hero"
        style={{ background: "linear-gradient(155deg, var(--soft-paper-card) 0%, var(--soft-apricot) 100%)", border: "1px solid transparent" }}
      >
        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <p className="soft-eyebrow">вопрос дня · по вашим разборам</p>
            {/* round-4 #11: the FULL ritual (textarea → взгляд+шаг), same as
                Главная — not a dead «отметить» button. */}
            <DailyPracticeActions
              completed={Boolean(dailyCard.completedAt)}
              variant="full"
              prompt={dailyCard.prompt}
              perspective={diaryBeats.perspective}
              step={diaryBeats.step}
              initialReflection={dailyCard.reflectionText}
            />
            <p className="mt-2 text-[11.5px]" style={{ color: "var(--soft-ink-faint)" }}>останется в записях ниже · виден только вам · на 7-й день серии придёт итог недели</p>
          </div>
          <aside className="rounded-[16px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="soft-eyebrow">эта неделя</span>
              <div
                className="grid size-12 place-items-center rounded-full text-sm font-semibold"
                data-testid="diary-streak-ring"
                style={{ background: "var(--soft-paper-deep)", color: "var(--soft-bordeaux)", fontFamily: "var(--font-heading-v4, serif)" }}
                aria-label={`Серия: ${practiceStreak.count} дней`}
              >
                {practiceStreak.count}
              </div>
            </div>
            <div className="flex gap-1.5" data-testid="diary-week-strip">
              {practiceWeekDays(weekCards.map((c) => c.cardDate)).map((day) => (
                <div key={day.label} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] uppercase" style={{ color: "var(--soft-ink-faint)" }}>{day.label}</span>
                  <span
                    className="grid aspect-square w-full place-items-center rounded-[10px] text-[11px] font-semibold"
                    style={{
                      background: day.done ? "var(--soft-terracotta)" : "transparent",
                      color: day.done ? "#FBF0E1" : "var(--soft-ink-faint)",
                      border: day.done ? "none" : day.isToday ? "1.5px solid var(--soft-terracotta)" : "1px dashed var(--soft-paper-edge)",
                    }}
                    data-done={day.done ? "1" : "0"}
                  >
                    {day.done ? "✓" : ""}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-[11px]" style={{ color: "var(--soft-ink-faint)" }}>мягкий ритм — без давления, можно пропускать</p>
          </aside>
        </div>
      </section>

      {/* Journaling history «ваши записи» (owner #1) — EVERY completed practice
          day (round-4 #12): свой вопрос или вопрос дня, recent 4 + «показать ещё». */}
      {journalEntries.length > 0 && (
        <section className="soft-card mb-4 p-5" data-testid="diary-journal-history">
          <p className="soft-eyebrow">ваши записи</p>
          <p className="mb-3 mt-1 text-[12.5px]" style={{ color: "var(--soft-ink-faint)" }}>
            Здесь каждый день, когда вы отвечали на вопрос дня, — ваш вопрос, взгляд и маленький шаг.
          </p>
          <RevealList initial={4} step={4} className="grid gap-2.5" moreLabel="Показать ещё">
            {journalEntries.map((entry) => (
              <JournalEntryCard key={entry.id} entry={entry} />
            ))}
          </RevealList>
        </section>
      )}

      {/* Warm, un-quoted self-noticing (owner #4). round-4 #12: it explains
          itself and offers ONE optional action — nothing is required. */}
      {observation && (
        <section className="soft-card mb-4 p-5" data-testid="diary-observation" style={{ background: "linear-gradient(155deg, var(--soft-paper-card), var(--soft-paper-deep))" }}>
          <p className="soft-italic" style={{ fontSize: 16, color: "var(--soft-ink-soft)", lineHeight: 1.5 }}>{observation.text}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {observationOffer && (
              <Link href={mainUrl(observationOffer.route)} className="soft-chip" data-testid="diary-observation-cta">
                {observationOffer.cta} →
              </Link>
            )}
            <span className="text-[12px]" style={{ color: "var(--soft-ink-faint)" }}>
              это просто наблюдение — можно ничего не делать
            </span>
          </div>
        </section>
      )}

      {/* «ваши разборы» — ONE card: clickable topic filters + compact rows,
          recent 4 + «показать ещё» (round-4 #12). */}
      <section className="soft-card mb-4 p-5" data-testid="diary-items-section">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="soft-eyebrow">{wantHidden ? "скрытые разборы" : "ваши разборы"}</div>
          {hiddenCount > 0 && (
            <a
              href={diaryHref({ topic: activeTopic, hidden: !wantHidden })}
              className="soft-button soft-button-ghost"
              style={{ minHeight: "2rem", padding: "0.375rem 0.75rem", fontSize: "0.8125rem" }}
            >
              {wantHidden ? "← Показать активные" : `Показать скрытые (${hiddenCount})`}
            </a>
          )}
        </div>

        {dialogueTopics.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2" data-testid="diary-dialogue-topics" role="group" aria-label="Фильтр по темам">
            <Link
              href={diaryHref({ hidden: wantHidden })}
              className={!activeTopic ? "soft-chip soft-chip-warm" : "soft-chip"}
              aria-pressed={!activeTopic}
              data-testid="diary-topic-all"
            >
              все темы
            </Link>
            {dialogueTopics.map((topic) => (
              <Link
                key={topic.value}
                href={diaryHref({ topic: topic.value, hidden: wantHidden })}
                className={activeTopic === topic.value ? "soft-chip soft-chip-warm" : "soft-chip"}
                data-topic-key={topic.value}
                aria-pressed={activeTopic === topic.value}
              >
                {topic.label}
                <span className="text-xs opacity-60">{topic.count}</span>
              </Link>
            ))}
          </div>
        )}

        {items.length === 0 ? (
          <div className="soft-empty-stage rounded-[16px] p-10 text-center">
            <h2 className="soft-h3">{activeTopic ? "По этой теме пока нет разборов" : "Здесь пока пусто"}</h2>
            <p className="mt-3 mx-auto max-w-md text-sm" style={{ color: "var(--soft-ink-soft)" }}>
              {activeTopic
                ? "Выберите другую тему или сбросьте фильтр."
                : "Начните с вопроса или сохраните готовый результат — и он появится здесь."}
            </p>
            {activeTopic ? (
              <Link href={diaryHref({ hidden: wantHidden })} className="soft-button soft-button-ghost mt-5">Сбросить фильтр</Link>
            ) : (
              <Link href={mainUrl("/checkin")} className="soft-button soft-button-primary mt-5">Задать вопрос</Link>
            )}
          </div>
        ) : (
          <RevealList initial={4} step={4} className="divide-y divide-[var(--soft-paper-edge)]" moreLabel="Показать ещё">
            {items.map((item) => {
              return (
                <article key={`${item.kind}:${item.id}`} className="flex flex-col gap-2.5 py-4 first:pt-0 last:pb-0" data-testid="diary-items">
                  <div className="min-w-0">
                    {/* Meta: datetime first, then category + status (round-4 #3 format). */}
                    <p className="text-xs" style={{ color: "var(--soft-ink-faint)" }}>
                      {item.updatedAt.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}, {item.updatedAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      {" · "}{item.topicLabel ?? item.eyebrow}{" · "}{mapItemStatusRu(item.kind, item.status)}
                    </p>
                    <h2 className="mt-1 font-heading text-lg font-medium break-words" style={{ color: "var(--soft-ink)" }}>{item.title}</h2>
                    {item.description && (
                      <p className="mt-1 line-clamp-2 break-words text-sm leading-relaxed [overflow-wrap:anywhere]" style={{ color: "var(--soft-ink-soft)" }}>{item.description}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={item.href} className="soft-button soft-button-primary"
                      style={{ minHeight: "2rem", padding: "0.375rem 0.75rem", fontSize: "0.8125rem" }}>
                      Открыть
                    </Link>
                    {item.kind === "product" && (
                      <form action={saveMapItem}>
                        <input type="hidden" name="id" value={item.id} />
                        <button type="submit" className="soft-button soft-button-ghost"
                          style={{ minHeight: "2rem", padding: "0.375rem 0.75rem", fontSize: "0.8125rem" }}>
                          Сохранить
                        </button>
                      </form>
                    )}
                    <a href={shareHref(item.title, item.shareTopic)} className="soft-button soft-button-ghost"
                      style={{ minHeight: "2rem", padding: "0.375rem 0.75rem", fontSize: "0.8125rem" }}
                      data-analytics-event="my_map_share_clicked"
                      data-analytics-surface="my_map"
                      data-analytics-target={item.kind}>
                      <Share2 className="size-4" />
                      Поделиться
                    </a>
                    {item.kind === "dialogue" && (() => {
                      const consent = { libraryConsentAt: item.libraryConsentAt ?? null, libraryStatus: item.libraryStatus ?? null };
                      const badge = consentBadge(consent);
                      if (canGrantConsent(consent)) {
                        return (
                          <form action={grantLibraryConsent}>
                            <input type="hidden" name="id" value={item.id} />
                            <button type="submit" className="soft-button soft-button-ghost"
                              style={{ minHeight: "2rem", padding: "0.375rem 0.75rem", fontSize: "0.8125rem" }}
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
                        style={{ minHeight: "2rem", padding: "0.375rem 0.75rem", fontSize: "0.8125rem" }}
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
                        style={{ minHeight: "2rem", padding: "0.375rem 0.75rem", fontSize: "0.8125rem", color: "var(--soft-bordeaux)" }}
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
          </RevealList>
        )}
      </section>

      {/* «Тема рода» — the family-lineage standing card (owner #5). */}
      {familyCount >= 2 && (
        <section
          className="soft-card mt-4 flex flex-wrap items-center gap-4 p-5"
          data-testid="diary-family-theme"
          style={{ background: "linear-gradient(155deg, #FBF8FE, var(--soft-lilac-bg, #EFEAF6))", border: "1px solid rgba(155,134,201,0.28)" }}
        >
          <div className="min-w-0 flex-1">
            <p className="soft-eyebrow" style={{ color: "#6E5BA6" }}>тема рода</p>
            <p className="mt-1" style={{ fontSize: 15, fontWeight: 600, color: "#43356E" }}>
              Тема семьи возвращается в ваших разборах ({familyCount} {familyCountWord(familyCount)})
            </p>
            <p className="text-[12.5px]" style={{ color: "var(--soft-ink-soft)" }}>
              Можно собрать это в один разбор — спокойно рассмотреть, как складываются отношения с родителями и близкими и какие сценарии в них повторяются.
            </p>
          </div>
          <Link href={mainUrl("/products/family-scenarios")} className="soft-button shrink-0" style={{ background: "var(--soft-lilac, #9B86C9)", color: "#fff" }}>
            Разбор рода
          </Link>
        </section>
      )}
    </div>
    </DiaryPinGate>
  );
}
