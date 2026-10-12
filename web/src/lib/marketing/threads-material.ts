/**
 * B762 — СВЕЖИЙ МАТЕРИАЛ ДЛЯ THREADS: РАЗВЕДЧИК РАЗ В ДВОЕ СУТОК.
 *
 * Сухой прогон 2026-10-12 показал, откуда «вялые и однотипные» посты: тема
 * поста Threads бралась из SEO-библиотеки слота (`targetQuery`), и 56 постов
 * подряд вышли про «репетицию тяжёлого разговора» и «карьеру против любви».
 * Владелец предложил: «агенты-исследователи раз в 2 дня сами набирают свежий
 * материал из открытых источников, а не одна и та же база везде».
 *
 * ⚠ ПОИСК ПО САМОМУ THREADS НАМ ЗАКРЫТ. Замер B755: на Standard Access
 * `keyword_search` и `/mentions` видят только наши собственные посты, а
 * публичный поиск требует App Review. Поэтому разведчик читает открытые
 * ленты, которые читаются без входа (веб-версия `t.me/s/<канал>`, тот же путь,
 * что у радара тем B702), и вынимает из них ЖИВЫЕ СЦЕНЫ — ситуацию и реакцию,
 * которую она вызывает у людей. Чужой текст не цитируется и не пересказывается:
 * автор получает сцену как повод и пишет свой пост с нуля.
 *
 * Каждая сцена отдаётся одному посту и больше не выдаётся: «контент должен
 * каждый раз генерироваться новый». Нет свежих сцен — пост пишется на
 * свободную тему, а не на SEO-запрос.
 */

import { z } from "zod";
import db from "@/lib/db";
import { log } from "@/lib/logger";
import { aiComplete } from "@/lib/ai";
import { marketingPlatformValue } from "@/lib/marketing/platform-settings";
import { MARKETING_TOPIC_RADAR_FEATURE, marketingProviderOrder } from "@/lib/marketing/model-pool";
import { marketingPoolAvailability } from "@/lib/marketing/pool-capacity";
import {
  approvedAreaNames,
  areaWeights,
  chooseArea,
  matchApprovedArea,
  readAreas,
  recordSightings,
  writeAreas,
  type LifeArea,
} from "@/lib/marketing/threads-life-areas";
import { readThreadsVerdicts } from "@/lib/marketing/threads-verdicts";
import {
  TELEGRAM_TREND_TIMEOUT_MS,
  parseChannelPosts,
  telegramChannelPageRequest,
} from "@/lib/marketing/trend-telegram";

export const THREADS_MATERIAL_POOL_KEY = "THREADS_MATERIAL_POOL";
export const THREADS_SCOUT_CHANNELS_KEY = "THREADS_SCOUT_TELEGRAM_CHANNELS";
/** Раз в двое суток — решение владельца 2026-10-12. */
export const THREADS_SCOUT_PERIOD_MS = 48 * 3_600_000;
/** Сцена старше этого уже не «свежая» — её не выдаём. */
export const SCENE_FRESH_MS = 7 * 86_400_000;
const POOL_LIMIT = 200;
const SCENES_PER_SCOUT = 24;

/**
 * Каналы по умолчанию — те, что уже проверены радаром тем B702 по пяти
 * критериям (`trend-telegram.ts`): отношения и таро. Список правится настройкой
 * `THREADS_SCOUT_TELEGRAM_CHANNELS` без выкатки.
 */
export const THREADS_SCOUT_DEFAULT_CHANNELS = [
  "psikhologiak", "otnoshenia_psi", "pcollege_EvaSneg", "abdartartemka",
  "taro_jennifer", "tarogks", "nehgoro", "kosmo_woman22",
] as const;

export interface ThreadsScene {
  id: string;
  /** Ситуация своими словами, 1–2 предложения. */
  scene: string;
  /** Какую реакцию сцена вызывает у людей. */
  reaction: string;
  /** Почему люди об этом пишут и что ответили бы под постом. */
  why: string;
  /** B767: область жизни из утверждённого списка; нет — сцена вне списка. */
  area?: string;
  foundAt: string;
  usedBy?: string;
  usedAt?: string;
}

export interface ThreadsMaterialPool {
  scoutedAt: string | null;
  scenes: ThreadsScene[];
}

const SceneSchema = z.object({
  scene: z.string().min(10).max(400),
  reaction: z.string().min(3).max(80),
  why: z.string().min(5).max(300),
  area: z.string().max(80).optional(),
});
const ScoutResponseSchema = z.object({ scenes: z.array(SceneSchema).min(1) });
/** Окно повтора сцены: сцену прошлой недели повторять можно (решение владельца 2026-10-12). */
export const SCENE_REPEAT_WINDOW_MS = 7 * 86_400_000;
const SHINGLE = 3;
const SIMILAR = 0.5;

export function parsePool(raw: string | null | undefined): ThreadsMaterialPool {
  if (!raw) return { scoutedAt: null, scenes: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<ThreadsMaterialPool>;
    return {
      scoutedAt: typeof parsed.scoutedAt === "string" ? parsed.scoutedAt : null,
      scenes: Array.isArray(parsed.scenes) ? parsed.scenes.filter((scene) => typeof scene?.scene === "string") : [],
    };
  } catch {
    return { scoutedAt: null, scenes: [] };
  }
}

async function readPool(): Promise<ThreadsMaterialPool> {
  const row = await db.platformSetting.findUnique({ where: { key: THREADS_MATERIAL_POOL_KEY } });
  return parsePool(row?.value);
}

async function writePool(pool: ThreadsMaterialPool): Promise<void> {
  const value = JSON.stringify(pool);
  await db.platformSetting.upsert({
    where: { key: THREADS_MATERIAL_POOL_KEY },
    create: { key: THREADS_MATERIAL_POOL_KEY, value },
    update: { value },
  });
}

export function scoutDue(pool: ThreadsMaterialPool, now: Date): boolean {
  if (!pool.scoutedAt) return true;
  return now.getTime() - Date.parse(pool.scoutedAt) >= THREADS_SCOUT_PERIOD_MS;
}

function normalizedScene(text: string): string {
  return text.toLocaleLowerCase("ru-RU").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Новые сцены в пул: без дублей, старые использованные уходят первыми. */
function shingles(text: string): Set<string> {
  const words = normalizedScene(text).split(" ").filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + SHINGLE <= words.length; i++) out.add(words.slice(i, i + SHINGLE).join(" "));
  return out;
}

/** Две сцены об одном: доля общих трёхсловных шинглов не меньше половины меньшей. */
export function scenesSimilar(left: string, right: string): boolean {
  const a = shingles(left);
  const b = shingles(right);
  if (a.size === 0 || b.size === 0) return normalizedScene(left) === normalizedScene(right);
  let common = 0;
  for (const item of a) if (b.has(item)) common += 1;
  return common / Math.min(a.size, b.size) >= SIMILAR;
}

export function mergeScenes(pool: ThreadsMaterialPool, found: readonly Omit<ThreadsScene, "id" | "foundAt">[], now: Date): ThreadsMaterialPool {
  // Блокирует только повтор за последние 7 суток: сцена прошлой недели снова годится.
  const windowStart = now.getTime() - SCENE_REPEAT_WINDOW_MS;
  const recentTexts = pool.scenes
    .filter((scene) => Date.parse(scene.usedAt ?? scene.foundAt) >= windowStart)
    .map((scene) => scene.scene);
  const fresh: ThreadsScene[] = [];
  found.forEach((scene, index) => {
    const key = normalizedScene(scene.scene);
    if (!key || recentTexts.some((text) => scenesSimilar(text, scene.scene))) return;
    recentTexts.push(scene.scene);
    fresh.push({ ...scene, id: `s${now.getTime().toString(36)}-${index}`, foundAt: now.toISOString() });
  });
  const merged = [...pool.scenes, ...fresh];
  const unused = merged.filter((scene) => !scene.usedAt);
  const used = merged.filter((scene) => scene.usedAt);
  const trimmed = [...used.slice(Math.max(0, used.length - Math.max(0, POOL_LIMIT - unused.length))), ...unused]
    .slice(-POOL_LIMIT);
  return { scoutedAt: now.toISOString(), scenes: trimmed };
}

/** Сцена для поста: самая старая из свежих неиспользованных. Чистая функция. */
export function takeScene(
  pool: ThreadsMaterialPool,
  publicationId: string,
  now: Date,
  weights?: Readonly<Record<string, number>>,
): { pool: ThreadsMaterialPool; scene: ThreadsScene | null; claimed: boolean } {
  const already = pool.scenes.find((scene) => scene.usedBy === publicationId);
  if (already) return { pool, scene: already, claimed: false };
  const fresh = pool.scenes
    .filter((scene) => !scene.usedAt && now.getTime() - Date.parse(scene.foundAt) <= SCENE_FRESH_MS)
    .sort((left, right) => Date.parse(left.foundAt) - Date.parse(right.foundAt));
  // B767: область выбирает квота недели (вес по вердиктам владельца, минимум на пробу).
  const usedThisWeek: Record<string, number> = {};
  for (const scene of pool.scenes) {
    if (scene.usedAt && scene.area && now.getTime() - Date.parse(scene.usedAt) <= SCENE_REPEAT_WINDOW_MS) {
      usedThisWeek[scene.area] = (usedThisWeek[scene.area] ?? 0) + 1;
    }
  }
  const areas = [...new Set(fresh.map((scene) => scene.area).filter((area): area is string => Boolean(area)))];
  const chosen = chooseArea({ candidates: areas, usedThisWeek, weights });
  const candidate = (chosen ? fresh.find((scene) => scene.area === chosen) : null) ?? fresh[0];
  if (!candidate) return { pool, scene: null, claimed: false };
  const taken: ThreadsScene = { ...candidate, usedBy: publicationId, usedAt: now.toISOString() };
  return {
    pool: { ...pool, scenes: pool.scenes.map((scene) => (scene.id === candidate.id ? taken : scene)) },
    scene: taken,
    claimed: true,
  };
}

/** Сцена для поста Threads; отказ хранилища поста не валит — пишем на свободную тему. */
export async function claimThreadsScene(publicationId: string, now = new Date()): Promise<ThreadsScene | null> {
  try {
    const weights = areaWeights(await readThreadsVerdicts().catch(() => []));
    const { pool, scene, claimed } = takeScene(await readPool(), publicationId, now, weights);
    if (claimed) await writePool(pool);
    return scene;
  } catch (error) {
    log.warn("marketing.threads_scene_claim_failed", { publicationId, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export function scoutPrompt(posts: readonly string[], areas: readonly string[] = []): string {
  // По кодовым точкам, а не по UTF-16: обрезка посреди эмодзи оставляла
  // одинокий суррогат, и журнал запросов (jsonb) отвергал весь вызов модели.
  const sample = posts.slice(0, 40)
    .map((post) => Array.from(post.replace(/[\uD800-\uDFFF]/gu, "")).slice(0, 300).join(""))
    .join("\n---\n");
  return `Ты — разведчик живого материала для ленты Threads (русскоязычная аудитория 20–35 лет: отношения, бывшие, работа, деньги, подруги, семья, знаки зодиака, таро).

Ниже — посты открытых каналов. Найди в них ${SCENES_PER_SCOUT} РАЗНЫХ жизненных сцен, из которых получится пост, под которым люди не смогут промолчать.

Сцена — это конкретная ситуация с деталью (кто, что сказал или сделал, где, во сколько) И С ПОВОРОТОМ или жалом, а не тема и не открытка. Плохо: «Отношения после расставания» (тема), «Вместе собираем пазл и смеёмся» (открытка, никто не ответит). Хорошо: «Бывший через год лайкнул фото в 2 ночи и через минуту убрал лайк — а ты уже успела показать скрин трём подругам».

Тест каждой сцены: увидев её в ленте, человек напишет «это я», «это мой бывший», «да ладно», «убила бы» или перешлёт подруге. Если реакция — «мило» или «ну ок», сцена не годится.

Голос ленты: ирония, кринж, бытовой хоррор узнавания, наглая правда, мелкая месть, зависть, нежность без сиропа. Российские реалии: голосовые по 4 минуты, «ты где?» в 23:40, тётя на семейном застолье, начальница в 18:55, ипотека, Wildberries, общий чат дома. Слова «партнёр», «отношения», «осознанность», «бранч» — канцелярит, вместо них: парень, муж, бывший, подруга, мама, начальница.

Для каждой сцены назови ОДНУ реакцию читателя (посмеяться, удивиться, разозлиться, ужаснуться, умилиться, обрадоваться, позавидовать, посочувствовать, вспомнить своё и рассказать, поспорить) и что люди напишут в комментариях.

Правила:
- Своими словами. Не цитируй и не пересказывай конкретный пост, не называй каналы, авторов и реальных людей.
- Разные сферы и разные реакции: не больше четверти сцен про бывших, не больше трети смешных, «умилиться» — не больше трёх.
- Без рекламы, без медицины и диагнозов, без насилия и кризисных историй.

${areas.length > 0 ? `Для каждой сцены укажи область жизни ТОЧНО как в списке: ${areas.join("; ")}. Распредели сцены по областям широко, не копи в одной. Если сцена не подходит ни под одну область, назови новую область коротко (1–3 слова) в поле area — владелец утвердит её.\n\n` : ""}Сцены с поворотом и физически возможные: человек не может одновременно быть в двух местах и делать несовместимое. Ориентир планки — посты, которые владелец оценил на 9–10: узнаваемая деталь и жало, а не открытка.

Верни СТРОГО JSON без markdown:
{"scenes":[{"scene":"...","reaction":"...","why":"..."${areas.length > 0 ? ',"area":"..."' : ""}}]}

Посты:
${sample}`;
}

export const GOOGLE_CSE_KEY = "GOOGLE_CSE_API_KEY";
export const GOOGLE_CSE_CX = "GOOGLE_CSE_CX";
const GOOGLE_QUERIES_PER_PASS = 5;

/**
 * B767: тренды Threads через Google Programmable Search (`site:threads.com`).
 * Работает, только если заданы ключ и поисковая система; отказ — не ошибка прохода.
 * ⚠ Что поисковая система отдаёт ТЕКСТЫ постов, а не заглушки, не проверено —
 * пока ключа нет, источник молчит; проверка на живом вызове — шаг выкатки.
 */
export async function fetchGoogleTrendTexts(input: {
  topics: readonly string[];
  fetchImpl?: typeof fetch;
  key?: string | null;
  cx?: string | null;
}): Promise<string[]> {
  const key = input.key ?? await marketingPlatformValue(GOOGLE_CSE_KEY).catch(() => null);
  const cx = input.cx ?? await marketingPlatformValue(GOOGLE_CSE_CX).catch(() => null);
  if (!key || !cx) return [];
  const call = input.fetchImpl ?? fetch;
  const results = await Promise.allSettled(input.topics.slice(0, GOOGLE_QUERIES_PER_PASS).map(async (topic) => {
    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.set("key", key);
    url.searchParams.set("cx", cx);
    url.searchParams.set("q", `site:threads.com ${topic}`);
    url.searchParams.set("num", "10");
    url.searchParams.set("lr", "lang_ru");
    const response = await call(url, { signal: AbortSignal.timeout(TELEGRAM_TREND_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json() as { items?: Array<{ title?: string; snippet?: string }> };
    return (payload.items ?? []).map((item) => [item.title, item.snippet].filter(Boolean).join(". ")).filter((text) => text.length > 40);
  }));
  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

function stripJsonFence(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/u.exec(text);
  return (fenced ? fenced[1] : text).trim();
}

/**
 * Проход разведчика. Возвращает число новых сцен; отказ любого источника или
 * модели не бросает исключение наружу — воркер не должен падать из-за ленты.
 */
export async function runThreadsMaterialScout(input: {
  now?: Date;
  force?: boolean;
  fetchImpl?: typeof fetch;
  completeImpl?: typeof aiComplete;
} = {}): Promise<{ ran: boolean; added: number; posts: number; reason?: string }> {
  const now = input.now ?? new Date();
  const pool = await readPool();
  if (!input.force && !scoutDue(pool, now)) return { ran: false, added: 0, posts: 0, reason: "not-due" };

  const configured = (await marketingPlatformValue(THREADS_SCOUT_CHANNELS_KEY).catch(() => null) ?? "")
    .split(/[\s,;]+/).map((value) => value.replace(/^@/, "").trim()).filter(Boolean);
  const channels = configured.length > 0 ? configured : [...THREADS_SCOUT_DEFAULT_CHANNELS];
  const call = input.fetchImpl ?? fetch;
  const pages = await Promise.allSettled(channels.map(async (channel) => {
    const request = telegramChannelPageRequest(channel);
    const response = await call(request.url, { headers: request.headers, signal: AbortSignal.timeout(TELEGRAM_TREND_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseChannelPosts(await response.text());
  }));
  const areas = await readAreas().catch(() => [] as LifeArea[]);
  const googleTexts = await fetchGoogleTrendTexts({
    topics: approvedAreaNames(areas).sort(() => Math.random() - 0.5),
    fetchImpl: input.fetchImpl,
  }).catch(() => [] as string[]);
  const posts = [...pages.flatMap((page) => (page.status === "fulfilled" ? page.value : [])), ...googleTexts];
  if (posts.length === 0) {
    log.warn("marketing.threads_scout_no_posts", { channels: channels.length });
    return { ran: true, added: 0, posts: 0, reason: "no-posts" };
  }

  try {
    const complete = input.completeImpl ?? aiComplete;
    // B699: только ключи, которые сейчас не остывают, — как у радара тем.
    const availability = await marketingPoolAvailability(now);
    const response = await complete({
      feature: MARKETING_TOPIC_RADAR_FEATURE,
      dataClass: "PUBLIC_MARKETING",
      providerOrder: marketingProviderOrder(`threads-scout:${now.toISOString().slice(0, 10)}`, [], availability.providers),
      // Потолок с запасом: у Gemini рассуждение съедает вывод, и 3000 обрывали JSON (замер 2026-10-12).
      maxTokens: 16000,
      temperature: 0.7,
      requestId: `marketing-threads-scout:${now.getTime()}`,
      messages: [{ role: "user", content: scoutPrompt(posts, approvedAreaNames(areas)) }],
    });
    const parsed = ScoutResponseSchema.safeParse(JSON.parse(stripJsonFence(response.text ?? "")));
    if (!parsed.success) {
      log.warn("marketing.threads_scout_schema_invalid", { error: parsed.error.message.slice(0, 300) });
      return { ran: true, added: 0, posts: posts.length, reason: "schema-invalid" };
    }
    // B767: область — только из утверждённого списка; названное моделью новое уходит в предложения.
    const proposed = parsed.data.scenes
      .filter((scene) => scene.area && !matchApprovedArea(areas, scene.area))
      .map((scene) => scene.area as string);
    if (areas.length > 0) await writeAreas(recordSightings(areas, proposed, now)).catch(() => undefined);
    const tagged = parsed.data.scenes.map((scene) => ({ ...scene, area: matchApprovedArea(areas, scene.area) ?? undefined }));
    const merged = mergeScenes(pool, tagged, now);
    await writePool(merged);
    const added = merged.scenes.length - pool.scenes.length;
    log.info("marketing.threads_scout_done", { posts: posts.length, added, pool: merged.scenes.length });
    return { ran: true, added: Math.max(0, added), posts: posts.length };
  } catch (error) {
    log.warn("marketing.threads_scout_failed", { error: error instanceof Error ? error.message : String(error) });
    return { ran: true, added: 0, posts: posts.length, reason: "model-failed" };
  }
}
