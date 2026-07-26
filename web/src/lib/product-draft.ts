/**
 * Черновик формы услуги, переживающий уход на страницу оплаты.
 *
 * INC-082. Человек описывает свою ситуацию — иногда несколькими абзацами, —
 * нажимает «Картой», уходит на Robokassa, платит и возвращается на пустую
 * форму. Текст набран один раз и потерян; заплатив, он должен набрать его
 * заново, чтобы получить то, за что заплатил.
 *
 * Хранилище — `sessionStorage`: черновик нужен ровно на время одной отлучки во
 * внешний платёжный контур и не должен переживать закрытие вкладки. Это
 * личное описание жизненной ситуации, и оставлять его в браузере дольше, чем
 * требуется, — не бережно.
 */

const PREFIX = "eterapy:product-draft:";
/** Черновик старше этого срока не восстанавливается — оплата столько не длится. */
const MAX_AGE_MS = 60 * 60 * 1000;

interface StoredDraft {
  savedAt: number;
  data: unknown;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    // Приватный режим Safari умеет бросать на самом обращении к хранилищу.
    return null;
  }
}

export function saveProductDraft(productKey: string, data: unknown): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(PREFIX + productKey, JSON.stringify({ savedAt: Date.now(), data } satisfies StoredDraft));
  } catch {
    // Квота или отключённое хранилище: потеря черновика хуже, чем его
    // отсутствие, но ломать оплату из-за неё нельзя.
  }
}

export function loadProductDraft<T>(productKey: string): T | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(PREFIX + productKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    if (typeof parsed?.savedAt !== "number" || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      store.removeItem(PREFIX + productKey);
      return null;
    }
    return (parsed.data ?? null) as T | null;
  } catch {
    return null;
  }
}

export function clearProductDraft(productKey: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(PREFIX + productKey);
  } catch {
    // см. saveProductDraft
  }
}
