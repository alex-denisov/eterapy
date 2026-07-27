import type { Prisma } from "@prisma/client";
import { ArrowRight, Bookmark, BookOpen, Eye, EyeOff, Globe, Trash2 } from "lucide-react";
import { ResultShareAction } from "@/components/cabinet/result-share-action";
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
import { daysWord, effectivePracticeStreak } from "@/lib/streak-display";
import { listJournalEntries } from "@/lib/journal-entries";
import { JournalCardsStrip } from "@/components/cabinet/journal-cards-strip";
import { topObservation } from "@/lib/diary-recommendation";
import { deepeningForTopic } from "@/lib/cabinet-recommendations";
import { DailyPracticeActions } from "@/components/cabinet/daily-practice-actions";
import { DiaryPinControl } from "@/components/cabinet/diary-pin-control";
import { RevealList } from "@/components/cabinet/reveal-list";
import { appUrl, loginUrl, mainUrl } from "@/lib/subdomain";
import { guardClientCabinet } from "@/lib/cabinet-access";
import { DiaryPinGate } from "@/components/cabinet/diary-pin-gate";
import { canGrantConsent, canWithdrawConsent, consentBadge, grantConsentPatch, withdrawConsentPatch } from "@/lib/library-consent";

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
    // B512 R1-8: в полосе карточек показываем только последние 7 дней.
    listJournalEntries(userId, 7),
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
              {/* Round-5 #6a: кольцо серии видно только при живой серии. */}
              {effectivePracticeStreak(practiceStreak.count, practiceStreak.lastDoneDate) > 0 && (
                <div
                  className="grid size-12 place-items-center rounded-full text-sm font-semibold"
                  data-testid="diary-streak-ring"
                  style={{ background: "var(--soft-paper-deep)", color: "var(--soft-bordeaux)", fontFamily: "var(--font-heading-v4, serif)" }}
                  aria-label={`Серия: ${practiceStreak.count} ${daysWord(practiceStreak.count)} подряд`}
                >
                  {practiceStreak.count}
                </div>
              )}
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
                      opacity: day.isFuture ? 0.45 : 1,
                    }}
                    data-done={day.done ? "1" : "0"}
                    data-future={day.isFuture ? "1" : undefined}
                  >
                    {day.done ? "✓" : ""}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-[11px]" style={{ color: "var(--soft-ink-faint)" }}>мягкий ритм — в удобном для вас темпе</p>
          </aside>
        </div>
      </section>

      {/* Journaling history «ваши записи» — B512 R1-8 (owner 2026-07-15):
          последние 7 дней компактными квадратными карточками в ряд (календарь
          заданных вопросов); клик по карточке раскрывает её контент снизу. */}
      {journalEntries.length > 0 && (
        <section className="soft-card mb-4 p-5" data-testid="diary-journal-history">
          <p className="soft-eyebrow">ваши записи</p>
          <p className="mb-3 mt-1 text-[12.5px]" style={{ color: "var(--soft-ink-faint)" }}>
            Последние 7 дней практики — выберите день, чтобы увидеть вопрос, взгляд и маленький шаг.
          </p>
          <JournalCardsStrip
            entries={journalEntries.slice(0, 7).map((entry) => ({
              id: entry.id,
              dayLabel: String(entry.date.getDate()),
              monthLabel: entry.date.toLocaleDateString("ru-RU", { month: "short" }).replace(".", ""),
              fullDateLabel: entry.date.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" }),
              question: entry.question,
              own: entry.own,
              perspective: entry.perspective,
              step: entry.step,
            }))}
          />
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
          <RevealList initial={4} step={4} className="grid gap-2.5" moreLabel="Показать ещё">
            {items.map((item) => {
              // B464 item 4: разбор rows now match the approved b464-diary mockup
              // — bordered card-rows with a topic-chip + a compact icon-action
              // cluster (Открыть · Поделиться · Скрыть · Удалить), the same visual
              // language as the Главная «ваши результаты» rows. Product-save and
              // the library-consent controls tuck into a subtle footer row so the
              // head stays clean.
              const consent = item.kind === "dialogue"
                ? { libraryConsentAt: item.libraryConsentAt ?? null, libraryStatus: item.libraryStatus ?? null }
                : null;
              const badge = consent ? consentBadge(consent) : null;
              const canGrant = consent ? canGrantConsent(consent) : false;
              const canWithdraw = consent ? canWithdrawConsent(consent) : false;
              const hasFoot = item.kind === "product" || Boolean(consent && (canGrant || badge));
              const chipLabel = item.topicLabel ?? item.eyebrow;
              return (
                <article key={`${item.kind}:${item.id}`} className="soft-diary-row" data-testid="diary-items">
                  <div className="flex items-center gap-3">
                    <Link href={item.href} className="soft-result-body">
                      <span className="soft-result-chip" title={chipLabel}>{chipLabel}</span>
                      <span className="soft-result-title">{item.title}</span>
                      <span className="soft-result-date">
                        {item.updatedAt.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}, {item.updatedAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}{" · "}{mapItemStatusRu(item.kind, item.status)}
                      </span>
                    </Link>
                    <div className="soft-result-acts">
                      <Link href={item.href} className="soft-result-act soft-result-act-primary" aria-label={`Открыть: ${item.title}`} title="Открыть">
                        <ArrowRight className="size-[18px]" aria-hidden="true" />
                      </Link>
                      {/* B512 §3.5 — лиловое share/gift-меню (анонимный инсайт
                          или подарить разбор) вместо прямой share-ссылки. */}
                      <ResultShareAction
                        title={item.title}
                        shareTopic={item.shareTopic}
                        surface="my_map"
                        kind={item.kind}
                      />
                      <form action={item.hidden ? unhideMapItem : hideMapItem}>
                        <input type="hidden" name="kind" value={item.kind} />
                        <input type="hidden" name="id" value={item.id} />
                        <button type="submit" className="soft-result-act" title={item.hidden ? "Показать" : "Скрыть"}
                          aria-label={item.hidden ? `Показать: ${item.title}` : `Скрыть: ${item.title}`}
                          data-analytics-event={item.hidden ? "my_map_unhide_clicked" : "my_map_hide_clicked"} data-analytics-surface="my_map" data-analytics-target={item.kind}>
                          {item.hidden ? <Eye className="size-[18px]" aria-hidden="true" /> : <EyeOff className="size-[18px]" aria-hidden="true" />}
                        </button>
                      </form>
                      <form action={deleteMapItem}>
                        <input type="hidden" name="kind" value={item.kind} />
                        <input type="hidden" name="id" value={item.id} />
                        <button type="submit" className="soft-result-act" style={{ color: "var(--soft-bordeaux)" }} title="Удалить"
                          aria-label={`Удалить: ${item.title}`}
                          data-analytics-event="my_map_delete_clicked" data-analytics-surface="my_map" data-analytics-target={item.kind}>
                          <Trash2 className="size-[18px]" aria-hidden="true" />
                        </button>
                      </form>
                    </div>
                  </div>
                  {hasFoot && (
                    <div className="soft-diary-row-foot">
                      {item.kind === "product" && (
                        <form action={saveMapItem}>
                          <input type="hidden" name="id" value={item.id} />
                          <button type="submit" className="soft-chip">
                            <Bookmark className="size-3" aria-hidden="true" />
                            Сохранить
                          </button>
                        </form>
                      )}
                      {consent && canGrant && (
                        <form action={grantLibraryConsent}>
                          <input type="hidden" name="id" value={item.id} />
                          <button type="submit" className="soft-chip"
                            title="Анонимно опубликовать этот вопрос в библиотеке. Перед публикацией он проходит модерацию, согласие можно отозвать в любой момент."
                            data-analytics-event="my_map_library_consent_granted" data-analytics-surface="my_map" data-analytics-target="dialogue">
                            <BookOpen className="size-3" aria-hidden="true" />
                            Опубликовать в библиотеке
                          </button>
                        </form>
                      )}
                      {consent && badge && !canGrant && (
                        <span className="inline-flex items-center gap-2">
                          <span className={`soft-chip ${badge.tone === "published" ? "soft-chip-warm" : ""}`}>
                            <Globe className="size-3" aria-hidden="true" />
                            {badge.label}
                          </span>
                          {canWithdraw && (
                            <form action={withdrawLibraryConsent}>
                              <input type="hidden" name="id" value={item.id} />
                              <button type="submit" className="soft-chip"
                                title="Отозвать согласие — вопрос не будет опубликован."
                                data-analytics-event="my_map_library_consent_withdrawn" data-analytics-surface="my_map" data-analytics-target="dialogue">
                                Убрать
                              </button>
                            </form>
                          )}
                        </span>
                      )}
                    </div>
                  )}
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
          <Link href={mainUrl("/products/family-questions")} className="soft-button shrink-0" style={{ background: "var(--soft-lilac, #9B86C9)", color: "#fff" }}>
            Разбор рода
          </Link>
        </section>
      )}
    </div>
    </DiaryPinGate>
  );
}
