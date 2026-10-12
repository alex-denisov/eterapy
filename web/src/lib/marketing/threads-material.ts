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
});
const ScoutResponseSchema = z.object({ scenes: z.array(SceneSchema).min(1) });

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
export function mergeScenes(pool: ThreadsMaterialPool, found: readonly Omit<ThreadsScene, "id" | "foundAt">[], now: Date): ThreadsMaterialPool {
  const known = new Set(pool.scenes.map((scene) => normalizedScene(scene.scene)));
  const fresh: ThreadsScene[] = [];
  found.forEach((scene, index) => {
    const key = normalizedScene(scene.scene);
    if (!key || known.has(key)) return;
    known.add(key);
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
export function takeScene(pool: ThreadsMaterialPool, publicationId: string, now: Date): { pool: ThreadsMaterialPool; scene: ThreadsScene | null; claimed: boolean } {
  const already = pool.scenes.find((scene) => scene.usedBy === publicationId);
  if (already) return { pool, scene: already, claimed: false };
  const candidate = pool.scenes
    .filter((scene) => !scene.usedAt && now.getTime() - Date.parse(scene.foundAt) <= SCENE_FRESH_MS)
    .sort((left, right) => Date.parse(left.foundAt) - Date.parse(right.foundAt))[0];
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
    const { pool, scene, claimed } = takeScene(await readPool(), publicationId, now);
    if (claimed) await writePool(pool);
    return scene;
  } catch (error) {
    log.warn("marketing.threads_scene_claim_failed", { publicationId, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export function scoutPrompt(posts: readonly string[]): string {
  const sample = posts.slice(0, 40).map((post) => post.slice(0, 300)).join("\n---\n");
  return `Ты — разведчик живого материала для ленты Threads (русскоязычная аудитория 20–35 лет: отношения, бывшие, работа, деньги, подруги, семья, знаки зодиака, таро).

Ниже — посты открытых каналов. Найди в них ${SCENES_PER_SCOUT} РАЗНЫХ жизненных сцен, из которых получится пост, под которым люди не смогут промолчать.

Сцена — это конкретная ситуация с деталью (кто, что сказал или сделал, где, когда), а не тема. «Отношения после расставания» — тема, плохо. «Бывший через год лайкнул фото в 2 ночи и тут же убрал лайк» — сцена, хорошо.

Для каждой сцены назови реакцию, которую она вызывает у читателя (посмеяться, удивиться, разозлиться, ужаснуться, умилиться, обрадоваться, захотеть того же, посочувствовать, вспомнить своё и рассказать, поспорить), и почему под таким постом пишут комментарии.

Правила:
- Своими словами. Не цитируй и не пересказывай конкретный пост, не называй каналы, авторов и реальных людей.
- Разные сферы и разные реакции: не больше трёх сцен про бывших и не больше трёх смешных подряд.
- Без рекламы, без медицины и диагнозов, без насилия и кризисных историй.

Верни СТРОГО JSON без markdown:
{"scenes":[{"scene":"...","reaction":"...","why":"..."}]}

Посты:
${sample}`;
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
  const posts = pages.flatMap((page) => (page.status === "fulfilled" ? page.value : []));
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
      maxTokens: 3000,
      temperature: 0.7,
      requestId: `marketing-threads-scout:${now.getTime()}`,
      messages: [{ role: "user", content: scoutPrompt(posts) }],
    });
    const parsed = ScoutResponseSchema.safeParse(JSON.parse(stripJsonFence(response.text ?? "")));
    if (!parsed.success) {
      log.warn("marketing.threads_scout_schema_invalid", { error: parsed.error.message.slice(0, 300) });
      return { ran: true, added: 0, posts: posts.length, reason: "schema-invalid" };
    }
    const merged = mergeScenes(pool, parsed.data.scenes, now);
    await writePool(merged);
    const added = merged.scenes.length - pool.scenes.length;
    log.info("marketing.threads_scout_done", { posts: posts.length, added, pool: merged.scenes.length });
    return { ran: true, added: Math.max(0, added), posts: posts.length };
  } catch (error) {
    log.warn("marketing.threads_scout_failed", { error: error instanceof Error ? error.message : String(error) });
    return { ran: true, added: 0, posts: posts.length, reason: "model-failed" };
  }
}
