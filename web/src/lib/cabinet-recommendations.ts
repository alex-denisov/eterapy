// B464 round-4 (items 2·4·5) — the cabinet recommendation engine.
//
// The owner's core complaint: every «следующий шаг» block froze on ONE static
// suggestion, so after the first visit the blocks stopped doing their job.
// This engine makes them behave like a recommendation system while staying
// fully autonomous and testable:
//
//   • PURE + DETERMINISTIC — no LLM, no storage: given the same profile
//     signals and the same day it always returns the same result (testable),
//     but the day-seed rotates copy/candidates daily and every meaningful user
//     action (a new разбор, a purchase, a booking, a journal entry) changes the
//     signals — so the surface keeps moving with the user.
//   • GOAL-DRIVEN — each block picks the next best step toward the product
//     goal (finish what you started → view a ready answer → deepen the
//     dominant theme → daily ritual → specialist), never re-suggesting a
//     deepening the user just bought (anti-repeat via recentProductKeys).
//   • BOOKING-AWARE — the practitioner card continues with the specialist the
//     user already met while the theme still matches their categories, and
//     switches to a theme-matched specialist when the theme moved on.
//
// Client-safe: no db/ai imports (see client-safe-lib-split).

import { dialogueTopicLabelRu } from "@/lib/dialogue-router";
import { dominantTopic, entriesWord, type DiaryTopicCounts } from "@/lib/diary-recommendation";

export { entriesWord };
import { TOPIC_CATEGORIES, type CategoryId } from "@/lib/practitioner-taxonomy";
import type { DialogueTopic } from "@/lib/product-format-recommendations";

// ── Signals ──────────────────────────────────────────────────────────────────

export interface CabinetSignals {
  topicCounts: DiaryTopicCounts;
  lastDialogue: {
    id: string;
    title: string;
    status: string;
    topic: string | null;
    ageHours: number;
  } | null;
  activeRoute: { title: string; status: string; currentDay: number } | null;
  /** productKeys of recent READY results — anti-repeat for deepening offers. */
  recentProductKeys: string[];
  hasUpcomingBooking: boolean;
  lastPastBooking: {
    practitionerName: string;
    practitionerSlug: string;
    categories: string[];
  } | null;
  journal: { total: number; entryToday: boolean; streak: number };
  crisisGuard: boolean;
}

// ── Deterministic day seed ───────────────────────────────────────────────────

/** djb2 over `${userId}:${yyyy-mm-dd}` — stable within a day, rotates daily. */
export function daySeed(userId: string, date: Date): number {
  const key = `${userId}:${date.toISOString().slice(0, 10)}`;
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash + key.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Salted pick so different blocks rotate independently off one seed. */
export function pickBy<T>(seed: number, salt: number, variants: readonly T[]): T {
  return variants[(seed + salt) % variants.length];
}

// ── Topic → paid deepening (the Triage matrix, doc 18 §8) ────────────────────

export interface DeepeningOffer {
  productKey: string;
  route: string;
  title: string;
  cta: string;
}

const FAMILY_MIN = 3;

export function deepeningForTopic(topic: string, familyCount: number): DeepeningOffer {
  if (topic === "family" && familyCount >= FAMILY_MIN) {
    return {
      productKey: "family-scenarios",
      route: "/products/family-scenarios",
      title: "Собрать семейные сценарии — как складываются отношения с близкими",
      cta: "Собрать сценарии",
    };
  }
  if (topic === "relationships") {
    return {
      productKey: "compatibility",
      route: "/products/pair",
      title: "Посмотреть на отношения вместе с близким человеком",
      cta: "Открыть «Вместе»",
    };
  }
  if (topic === "self") {
    return {
      productKey: "reframe",
      route: "/products/reframe",
      title: "Переосмыслить ситуацию — увидеть её с другой стороны",
      cta: "Провести анализ",
    };
  }
  return {
    productKey: "deep-report",
    route: "/products/deep-report",
    title: `Разобрать тему «${dialogueTopicLabelRu(topic)}» подробно и по частям`,
    cta: "Открыть подробный разбор",
  };
}

// ── Hero next-step (item 2) ──────────────────────────────────────────────────

export type HeroKind =
  | "resume-route"
  | "resume-dialogue"
  | "answer-ready"
  | "deepen"
  | "daily-step"
  | "specialist"
  | "new-question"
  | "first-question";

export interface HeroAction {
  kind: HeroKind;
  eyebrow: string;
  title: string;
  cta: string;
  hint: string;
  /** Relative route; the page wraps in mainUrl/appUrl by `surface`. */
  route: string;
  surface: "main" | "app";
}

const RESUME_FRESH_HOURS = 72;
const ANSWER_FRESH_HOURS = 48;
const UNFINISHED_STATUSES = new Set(["OPEN", "AWAITING_USER", "PROCESSING"]);

export function buildHeroAction(signals: CabinetSignals, seed: number): HeroAction {
  const { lastDialogue, activeRoute } = signals;
  const dominant = dominantTopic(signals.topicCounts);
  const themeLabel = dominant ? dialogueTopicLabelRu(dominant.topic) : null;

  // 1) A live route is a real journey — always resume it first.
  if (activeRoute) {
    return {
      kind: "resume-route",
      eyebrow: "вы продолжаете маршрут",
      title: activeRoute.title,
      cta: "Продолжить маршрут",
      hint: `${activeRoute.currentDay} день · ${activeRoute.status === "PAUSED" ? "на паузе" : "активен"}`,
      route: "/diary",
      surface: "app",
    };
  }

  // 2) Finish what you started — but only while it's actually fresh.
  if (lastDialogue && UNFINISHED_STATUSES.has(lastDialogue.status) && lastDialogue.ageHours <= RESUME_FRESH_HOURS) {
    return {
      kind: "resume-dialogue",
      eyebrow: lastDialogue.topic
        ? `вы остановились на теме «${dialogueTopicLabelRu(lastDialogue.topic)}»`
        : "вы остановились на разговоре",
      title: lastDialogue.title,
      cta: "Продолжить разбор",
      hint: lastDialogue.status === "PROCESSING" ? "ответ готовится" : "разбор ждёт вашего ответа",
      route: `/checkin?dialogueId=${lastDialogue.id}`,
      surface: "main",
    };
  }

  // 3) A fresh ready answer is worth one look.
  if (lastDialogue && lastDialogue.status === "ANSWERED" && lastDialogue.ageHours <= ANSWER_FRESH_HOURS) {
    return {
      kind: "answer-ready",
      eyebrow: lastDialogue.topic
        ? `ответ по теме «${dialogueTopicLabelRu(lastDialogue.topic)}» готов`
        : "ваш ответ готов",
      title: lastDialogue.title,
      cta: "Посмотреть ответ",
      hint: "спокойно, в своём темпе",
      route: `/checkin?dialogueId=${lastDialogue.id}`,
      surface: "main",
    };
  }

  // 4) Nothing at all yet → the free front door.
  if (!lastDialogue) {
    return {
      kind: "first-question",
      eyebrow: "с чего начать",
      title: "Задайте первый вопрос — спокойно и своими словами",
      cta: "Задать вопрос",
      hint: "первичный разбор бесплатный",
      route: "/checkin",
      surface: "main",
    };
  }

  // 5) The last thread is stale → rotate among the next best steps instead of
  //    nagging «продолжить» the same finished разбор forever (owner item 2).
  const candidates: HeroAction[] = [];

  if (dominant && themeLabel) {
    const offer = deepeningForTopic(dominant.topic, signals.topicCounts.family ?? 0);
    if (!signals.recentProductKeys.includes(offer.productKey)) {
      candidates.push({
        kind: "deepen",
        eyebrow: pickBy(seed, 1, [
          `следующий шаг по теме «${themeLabel}»`,
          `тема «${themeLabel}» просит продолжения`,
        ]),
        title: offer.title,
        cta: offer.cta,
        hint: "платный формат · можно открыть баллами",
        route: offer.route,
        surface: "main",
      });
    }
  }

  if (!signals.journal.entryToday) {
    candidates.push({
      kind: "daily-step",
      eyebrow: "сегодняшний шаг",
      title: "Ответить на вопрос дня — пара минут для себя",
      cta: "Ответить на вопрос дня",
      hint: "бесплатно · остаётся в дневнике",
      route: "/diary",
      surface: "app",
    });
  }

  if (dominant && dominant.count >= 3 && themeLabel && !signals.hasUpcomingBooking) {
    candidates.push({
      kind: "specialist",
      eyebrow: `тема «${themeLabel}» возвращается`,
      title: "Можно обсудить это с живым специалистом",
      cta: "Подобрать специалиста",
      hint: "выбор без обязательств",
      route: "/practitioners",
      surface: "main",
    });
  }

  candidates.push({
    kind: "new-question",
    eyebrow: "новый взгляд",
    title: "Задайте новый вопрос — спокойно и своими словами",
    cta: "Задать вопрос",
    hint: "первый шаг всегда бесплатный",
    route: "/checkin",
    surface: "main",
  });

  return pickBy(seed, 2, candidates);
}

// ── «что дальше по вашей теме» service-nudge (item 4) ───────────────────────

export interface ServiceNudge {
  key: "family-scenarios" | "together" | "deep-report" | "daily-question";
  body: string;
  ctaLabel: string;
  route: string;
  surface: "main" | "app";
  productKey: string | null;
}

const DOMINANT_MIN = 2;

export function buildServiceNudge(signals: CabinetSignals, seed: number): ServiceNudge | null {
  if (signals.crisisGuard) return null;

  const family = signals.topicCounts.family ?? 0;
  const dominant = dominantTopic(signals.topicCounts);
  const recent = signals.recentProductKeys;
  const candidates: ServiceNudge[] = [];

  // 1) Тема семьи в ≥3 разборах → «Семейные сценарии». The copy is about YOUR
  //    relationships with родители/близкие — NOT ancestry «из поколения в
  //    поколение» (owner item 4).
  if (family >= FAMILY_MIN) {
    candidates.push({
      key: "family-scenarios",
      body: pickBy(seed, 3, [
        `Тема семьи и близких повторяется в ваших разборах (${family}). «Семейные сценарии» помогут спокойно рассмотреть, как складываются ваши отношения с родителями и родными — и какие роли в них закрепились.`,
        `Вы уже не раз возвращались к теме семьи. Можно собрать эти наблюдения в один разбор — про отношения с близкими и сценарии, которые в них повторяются, — и наметить, что хочется изменить.`,
      ]),
      ctaLabel: "Собрать семейные сценарии",
      route: "/products/family-scenarios",
      surface: "main",
      productKey: "family-scenarios",
    });
  }

  if (dominant && dominant.count >= DOMINANT_MIN) {
    const label = dialogueTopicLabelRu(dominant.topic);
    if (dominant.topic === "relationships") {
      candidates.push({
        key: "together",
        body: pickBy(seed, 4, [
          `Чаще всего в ваших разборах звучит тема «${label}». «Вместе» поможет свериться со взглядом близкого человека — без терапии вдвоём, просто увидеть, где вы совпадаете.`,
          `Тема «${label}» возвращается. Иногда помогает посмотреть на неё в паре: формат «Вместе» бережно сравнит два взгляда на одну ситуацию.`,
        ]),
        ctaLabel: "Посмотреть «Вместе»",
        route: "/products/pair",
        surface: "main",
        productKey: "compatibility",
      });
    } else if (dominant.topic !== "family") {
      candidates.push({
        key: "deep-report",
        body: pickBy(seed, 5, dominant.topic === "anxiety"
          ? [
              `Тема «${label}» занимает много места. Подробный разбор поможет рассмотреть её спокойно и по частям, с бережным следующим шагом.`,
              `Когда «${label}» рядом уже давно, помогает разложить её на части. Подробный разбор соберёт целостную картину и подскажет, с чего начать.`,
            ]
          : [
              `За последние разборы чаще всего возвращается тема «${label}». Можно собрать её в подробный разбор и наметить, куда двигаться дальше.`,
              `Тема «${label}» появляется снова и снова. Подробный разбор поможет увидеть, что за этим стоит, и выбрать следующий шаг.`,
            ]),
        ctaLabel: "Открыть подробный разбор",
        route: "/products/deep-report",
        surface: "main",
        productKey: "deep-report",
      });
    }
  }

  // Free fallback: the daily ritual — never monetize the reflective habit.
  candidates.push({
    key: "daily-question",
    body: pickBy(seed, 6, [
      "Здесь будет появляться подсказка по вашей теме. Пока — начните с вопроса дня: короткая практика помогает замечать, что важно именно вам.",
      "После пары разборов здесь появится персональная рекомендация. А сегодня можно сделать маленький шаг — ответить на вопрос дня.",
    ]),
    ctaLabel: "Ответить на вопрос дня",
    route: "/diary",
    surface: "app",
    productKey: null,
  });

  // Anti-repeat: skip a deepening the user opened recently.
  return candidates.find((c) => !c.productKey || !recent.includes(c.productKey)) ?? candidates[candidates.length - 1];
}

// ── «ваш дневник» card (item 5a) ─────────────────────────────────────────────

export interface DiaryCardReco {
  text: string;
  ctaLabel: string;
}

export function buildDiaryCard(signals: CabinetSignals, seed: number): DiaryCardReco {
  const dominant = dominantTopic(signals.topicCounts);
  const label = dominant ? dialogueTopicLabelRu(dominant.topic) : null;
  const { total, streak } = signals.journal;

  if (total === 0 && !dominant) {
    return {
      text: "Дневник пока пуст. Первая запись появится, когда вы ответите на вопрос дня или сохраните разбор.",
      ctaLabel: "Открыть дневник",
    };
  }

  const variants: DiaryCardReco[] = [];

  if (dominant && dominant.count >= 3 && label) {
    variants.push(
      {
        text: `Вы возвращаетесь к теме «${label}» — уже ${dominant.count} ${entriesWord(dominant.count)}. Похоже, сейчас она важнее других.`,
        ctaLabel: "Открыть дневник",
      },
      {
        text: `Тема «${label}» звучит в ваших записях чаще всего. Иногда полезно перечитать, как менялся ваш взгляд.`,
        ctaLabel: "Перечитать записи",
      },
    );
  }

  if (streak >= 3) {
    variants.push({
      text: `Вы отвечаете на вопрос дня уже ${streak} ${daysWord(streak)} подряд — мягкий ритм становится опорой.`,
      ctaLabel: "Открыть дневник",
    });
  }

  if (variants.length === 0) {
    if (label) {
      variants.push({
        text: `В последнее время вы чаще возвращаетесь к теме «${label}» — кажется, это сейчас важно для вас.`,
        ctaLabel: "Открыть дневник",
      });
    }
    if (total > 0) {
      variants.push({
        text: `В дневнике уже ${total} ${entriesWord(total)}. Загляните — видно, как менялись ваши вопросы.`,
        ctaLabel: "Открыть дневник",
      });
    }
    if (variants.length === 0) {
      variants.push({
        text: "Здесь собираются ваши разборы и заметки — только для вас.",
        ctaLabel: "Открыть дневник",
      });
    }
  }

  return pickBy(seed, 7, variants);
}

function daysWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "дня";
  return "дней";
}

// ── «если хочется живого разговора» practitioner plan (item 5b) ─────────────

export interface PractitionerPlan {
  mode: "continue" | "theme-match" | "explore";
  topic: string | null;
  topicLabel: string | null;
  /** Categories to match a specialist against (theme-match / explore). */
  categories: CategoryId[];
  /** For "continue": the practitioner the client already met. */
  continueWith: { name: string; slug: string } | null;
}

export function planPractitionerCard(signals: CabinetSignals): PractitionerPlan | null {
  // An upcoming booking owns the slot («ближайшая встреча»).
  if (signals.hasUpcomingBooking) return null;

  const dominant = dominantTopic(signals.topicCounts);
  const topic = dominant?.topic ?? null;
  const topicLabel = topic ? dialogueTopicLabelRu(topic) : null;
  const topicCategories: CategoryId[] = topic
    ? TOPIC_CATEGORIES[topic as DialogueTopic] ?? ["psychology"]
    : [];

  const past = signals.lastPastBooking;
  if (past) {
    const stillMatches =
      !topic ||
      past.categories.length === 0 ||
      past.categories.some((c) => (topicCategories as string[]).includes(c));
    if (stillMatches) {
      return {
        mode: "continue",
        topic,
        topicLabel,
        categories: topicCategories,
        continueWith: { name: past.practitionerName, slug: past.practitionerSlug },
      };
    }
    // The theme moved on → suggest a specialist matching the NEW theme.
    return {
      mode: "theme-match",
      topic,
      topicLabel,
      categories: topicCategories,
      continueWith: null,
    };
  }

  return { mode: "explore", topic, topicLabel, categories: topicCategories, continueWith: null };
}

// ── «Рекомендуем вам» — ряд 3 слева (B602) ───────────────────────────────────
//
// Владелец: «переделать в рекомендательный блок … и дальше рекомендации делать
// на основании ИСПОЛЬЗОВАННЫХ РАЗБОРОВ».
//
// Это сознательно ДРУГОЙ сигнал, чем у `buildServiceNudge` (ряд 4 справа):
// там — доминирующая тема диалогов, здесь — какие услуги человек уже прошёл.
// UX-разбор предупреждал, что два блока рекомендаций на одном движке
// воспроизведут ту самую мозаику; разведение по сигналам — ответ на это, а не
// отказ от второго блока, которого владелец просил.

export interface UsageRecommendation {
  /** `null` только у бесплатной двери — у неё нет productKey. */
  productKey: string | null;
  kind: "start" | "adjacent";
  title: string;
  /** «потому что вы делали …» — почему именно это, а не что-то ещё. */
  reason: string;
  cta: string;
  route: string;
  surface: "main" | "app";
}

/**
 * Что естественно следует за уже пройденным. Порядок внутри списка — приоритет.
 * Ключи и маршруты сверены с `lib/v5-products.ts`.
 */
const ADJACENT_SERVICES: Record<string, readonly string[]> = {
  reframe: ["deep-report", "chat-analysis"],
  "deep-report": ["pair", "family-scenarios"],
  "chat-analysis": ["reframe", "pair"],
  pair: ["synastry", "family-scenarios"],
  tarot: ["horary", "numerology"],
  "natal-chart": ["synastry", "human-design"],
  synastry: ["pair", "natal-chart"],
  horary: ["tarot", "natal-chart"],
  "tarot-numerology": ["numerology", "natal-chart"],
  numerology: ["tarot-numerology", "human-design"],
  "family-scenarios": ["surname-story", "deep-report"],
  "human-design": ["natal-chart", "numerology"],
  "surname-story": ["family-scenarios", "numerology"],
};

/** Названия и адреса — те же, что на лендинге, без второй копии каталога. */
const SERVICE_TITLES: Record<string, { title: string; cta: string; route: string }> = {
  reframe: { title: "Переосмысление", cta: "Разобрать ситуацию", route: "/products/reframe" },
  "deep-report": { title: "Подробный разбор", cta: "Открыть разбор", route: "/products/deep-report" },
  "chat-analysis": { title: "Разбор переписки", cta: "Разобрать переписку", route: "/products/chat-analysis" },
  pair: { title: "Разобраться вдвоём", cta: "Открыть «Вместе»", route: "/products/pair" },
  tarot: { title: "Расклад Таро", cta: "Сделать расклад", route: "/products/tarot" },
  "natal-chart": { title: "Натальная карта", cta: "Построить карту", route: "/products/natal-chart" },
  synastry: { title: "Совместимость по звёздам", cta: "Проверить совместимость", route: "/products/synastry" },
  horary: { title: "Ответ на один вопрос", cta: "Задать вопрос картам", route: "/products/horary" },
  "tarot-numerology": { title: "Арканы рождения", cta: "Узнать свои арканы", route: "/products/tarot-numerology" },
  numerology: { title: "Матрица судьбы", cta: "Рассчитать матрицу", route: "/products/numerology" },
  "family-scenarios": { title: "Семейные сценарии", cta: "Собрать сценарии", route: "/products/family-scenarios" },
  "human-design": { title: "Дизайн человека", cta: "Построить бодиграф", route: "/products/human-design" },
  "surname-story": { title: "Кармический код фамилии", cta: "Разобрать фамилию", route: "/products/surname-story" },
};

const USAGE_RECOMMENDATION_LIMIT = 3;

export function buildUsageRecommendations(
  signals: CabinetSignals,
  seed: number,
  limit: number = USAGE_RECOMMENDATION_LIMIT,
): UsageRecommendation[] {
  // Человеку в кризисе платформа не продаёт. Пустой список — это ряд без
  // левой карточки, а не карточка с уговорами подождать.
  if (signals.crisisGuard) return [];

  const used = signals.recentProductKeys.filter((key) => key in SERVICE_TITLES);

  // Новичок: сначала бесплатная дверь, потом две флагманские услуги. Продавать
  // тому, кто ещё ничего не пробовал, — это и есть «непонятно, что тут делать».
  if (used.length === 0) {
    const flagships = pickBy(seed, 11, [
      ["reframe", "tarot"],
      ["reframe", "numerology"],
    ] as const);
    return [
      {
        productKey: null,
        kind: "start" as const,
        title: "Задать свой вопрос",
        reason: "Первый разбор бесплатный — с него понятнее всё остальное",
        cta: "Задать вопрос",
        route: "/checkin",
        surface: "main" as const,
      },
      ...flagships.map((key) => ({
        productKey: key,
        kind: "adjacent" as const,
        title: SERVICE_TITLES[key].title,
        reason: "С этого чаще всего начинают",
        cta: SERVICE_TITLES[key].cta,
        route: SERVICE_TITLES[key].route,
        surface: "main" as const,
      })),
    ].slice(0, limit);
  }

  // Ряд 4 занят своей рекомендацией по теме — не показываем её второй раз.
  const nudgeKey = buildServiceNudge(signals, seed)?.productKey ?? null;
  const excluded = new Set<string>([...used, ...(nudgeKey ? [nudgeKey] : [])]);

  const out: UsageRecommendation[] = [];
  // Обходим по свежести: последнее пройденное задаёт первую рекомендацию.
  for (const source of used) {
    for (const candidate of ADJACENT_SERVICES[source] ?? []) {
      if (excluded.has(candidate)) continue;
      excluded.add(candidate);
      const service = SERVICE_TITLES[candidate];
      out.push({
        productKey: candidate,
        kind: "adjacent",
        title: service.title,
        reason: `Вы делали «${SERVICE_TITLES[source].title}»`,
        cta: service.cta,
        route: service.route,
        surface: "main",
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}
