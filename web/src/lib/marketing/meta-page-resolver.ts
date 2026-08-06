/**
 * B693 — адресат Meta вычисляется из графа Страниц, а не выбирается человеком.
 *
 * ПОЧЕМУ ЭТОТ ФАЙЛ СУЩЕСТВУЕТ. Instagram сейчас подключается через «Instagram
 * API with Instagram Login»: маркер выдаётся тому аккаунту, под которым открыт
 * браузер, и экрана выбора аккаунта в этом потоке нет вовсе. Владелец был
 * залогинен личным профилем — маркер молча достался личному профилю
 * (`INSTAGRAM_USER_ID` = id `alexey_s_denisov`, проверено живьём в B685).
 * Никакой правкой ссылки это не лечится: выбирать там нечего.
 *
 * Meta документирует ровно тот обход, который назвал владелец («взять токены и
 * получить id страниц») — «Instagram API with Facebook Login»:
 *
 *   GET /me/accounts                                → Страницы пользователя
 *   GET /{page-id}?fields=instagram_business_account → id брендового аккаунта
 *   POST /{ig-user-id}/media                         → публикация маркером Страницы
 *
 * Здесь адресат не называется словами и не выбирается в чужом окне — он
 * вычисляется нами и потому доказуем: опись показывает, какие Страницы видит
 * маркер и какой Instagram привязан к каждой.
 *
 * ДЛЯ THREADS ЭТОГО МЕХАНИЗМА НЕТ. У `graph.threads.net` нет ни `/me/accounts`,
 * ни понятия Страницы: маркер Threads всегда принадлежит профилю, под которым
 * прошёл вход. Это ограничение площадки, а не наш недосмотр, — поэтому файл
 * сознательно про Instagram.
 */
import { metaEndpoint, metaRequestHeaders } from "@/lib/marketing/meta-endpoints";
import { META_BRAND_HANDLES } from "@/lib/marketing/meta-brand-account";
import { preserveMetaLargeIds } from "@/lib/marketing/meta-oauth";

const GRAPH_VERSION = "v23.0";

/** Поля запрашиваем явно: без них Meta не отдаёт ни маркер, ни привязку. */
const PAGE_FIELDS = "id,name,access_token,instagram_business_account{id,username}";

export interface MetaPageInventoryEntry {
  pageId: string;
  pageName: string;
  /** Маркер Страницы. Полученный из долгоживущего пользовательского — бессрочен. */
  pageToken: string | null;
  igUserId: string | null;
  igUsername: string | null;
}

export interface MetaPageInventory {
  /**
   * Откуда взялась опись. У маркера человека — из его Страниц, у маркера
   * системного пользователя — из бизнес-портфеля. Показывается владельцу:
   * пустая опись из разных источников означает разные следующие шаги.
   */
  source: "me/accounts" | "business/owned_pages";
  entries: MetaPageInventoryEntry[];
}

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

/**
 * Разбор ответа Meta. `preserveMetaLargeIds` обязателен: id Страниц и
 * `instagram_business_account` лежат в том же диапазоне, что испортил B689 —
 * длиннее `Number.MAX_SAFE_INTEGER`, и `JSON.parse` округляет их МОЛЧА.
 */
async function graphGet(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${metaEndpoint("facebook")}/${GRAPH_VERSION}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("access_token", token);

  const response = await fetch(url.toString(), {
    headers: metaRequestHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await response.text();
  const payload = (() => {
    try {
      return JSON.parse(preserveMetaLargeIds(raw)) as Record<string, unknown>;
    } catch {
      return null;
    }
  })();

  if (!response.ok || !payload) {
    const error = payload?.error as { message?: unknown } | undefined;
    throw new Error(
      `Meta Graph ${path} failed: ${error?.message ? String(error.message) : `HTTP ${response.status}`}`,
    );
  }
  return payload;
}

function toEntry(row: Record<string, unknown>): MetaPageInventoryEntry {
  const ig = row.instagram_business_account as { id?: unknown; username?: unknown } | undefined;
  return {
    pageId: String(row.id ?? ""),
    pageName: typeof row.name === "string" ? row.name : "",
    pageToken: typeof row.access_token === "string" ? row.access_token : null,
    igUserId: ig?.id === undefined || ig?.id === null ? null : String(ig.id),
    igUsername: typeof ig?.username === "string" ? ig.username : null,
  };
}

function rows(payload: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(payload.data)
    ? payload.data.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    : [];
}

/**
 * Опись всего, что видит маркер: какие Страницы и какой Instagram к каждой
 * привязан. Именно она — «подтверждение», которого требовал владелец: адресат
 * читается из ответа площадки, а не берётся с чьих-то слов.
 *
 * Отказ площадки БРОСАЕТСЯ, а не превращается в пустую опись: иначе достаточно
 * отвалиться релею, чтобы решить, что брендовой страницы не существует.
 */
export async function fetchMetaPageInventory(token: string): Promise<MetaPageInventory> {
  const direct = rows(await graphGet("me/accounts", token, { fields: PAGE_FIELDS, limit: "100" }));
  if (direct.length > 0) {
    return { source: "me/accounts", entries: direct.map(toEntry) };
  }

  // Маркер системного пользователя не «управляет Страницами» как человек —
  // `/me/accounts` у него пуст, а активы висят на портфеле. Это документированный
  // Meta путь для программной работы без участия человека, и он обязан находить
  // ту же страницу.
  const businesses = rows(await graphGet("me/businesses", token, { fields: "id,name", limit: "50" }));
  const owned: MetaPageInventoryEntry[] = [];
  for (const business of businesses) {
    const pages = rows(await graphGet(
      `${encodeURIComponent(String(business.id))}/owned_pages`,
      token,
      { fields: PAGE_FIELDS, limit: "100" },
    ));
    owned.push(...pages.map(toEntry));
  }
  return { source: "business/owned_pages", entries: owned };
}

/**
 * Брендовая страница из описи — или `null`.
 *
 * Совпадение считается ТОЛЬКО по имени привязанного аккаунта Instagram.
 * Совпадение по имени самой Страницы ничего не значит: публиковать в Instagram
 * через страницу без `instagram_business_account` нельзя в принципе, а «похожее
 * имя» — это ровно тот способ ошибиться адресатом, от которого мы и уходим.
 */
export function resolveMetaBrandPage(
  inventory: MetaPageInventory,
  handle: string = META_BRAND_HANDLES.instagram,
): MetaPageInventoryEntry | null {
  const expected = normalizeHandle(handle);
  return inventory.entries.find((entry) => (
    Boolean(entry.igUserId) && entry.igUsername !== null && normalizeHandle(entry.igUsername) === expected
  )) ?? null;
}
