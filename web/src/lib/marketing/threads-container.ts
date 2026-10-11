import { metaEndpoint, metaRequestHeaders } from "@/lib/marketing/meta-endpoints";

/**
 * Threads публикует в два шага: контейнер (`/threads`) и выпуск
 * (`/threads_publish`). Контейнер готовится на стороне Meta не мгновенно —
 * выпуск «сразу за созданием» иногда получает «The requested resource does not
 * exist», хотя контейнер создан. Прод 2026-10-11: одобренный ответ владельца
 * упал именно так и ушёл в архив, а ответ человеку остался без ответа.
 *
 * Поэтому перед выпуском ждём статус `FINISHED`, а «не существует» после
 * создания считаем «ещё не готов» и повторяем выпуск.
 */

const POLL_DELAYS_MS = [1500, 2500, 4000, 6000, 8000, 10000] as const;
const PUBLISH_RETRY_DELAYS_MS = [3000, 6000, 10000] as const;
const NOT_READY_PATTERN = /does not exist|not ready|try again|temporar/i;

type Sleep = (ms: number) => Promise<void>;

const defaultSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ThreadsPublishInput {
  userId: string;
  token: string;
  creationId: string;
  sleep?: Sleep;
}

async function containerStatus(
  creationId: string,
  token: string,
): Promise<{ status: string | null; error: string | null }> {
  try {
    const url = new URL(`${metaEndpoint("threads")}/v1.0/${encodeURIComponent(creationId)}`);
    url.searchParams.set("fields", "status,error_message");
    url.searchParams.set("access_token", token);
    const response = await fetch(url, { headers: metaRequestHeaders() });
    const payload = await response.json().catch(() => null) as
      { status?: string; error_message?: string } | null;
    return { status: payload?.status ?? null, error: payload?.error_message ?? null };
  } catch {
    return { status: null, error: null };
  }
}

async function waitForContainer(input: ThreadsPublishInput, sleep: Sleep): Promise<void> {
  for (const delay of POLL_DELAYS_MS) {
    const { status, error } = await containerStatus(input.creationId, input.token);
    if (status === "FINISHED" || status === "PUBLISHED") return;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new Error(`Threads container ${status}: ${error ?? "причина не названа"}`);
    }
    await sleep(delay);
  }
  // Статус так и не пришёл — пробуем выпустить как есть, повторы ниже подстрахуют.
}

export async function publishThreadsContainer(
  input: ThreadsPublishInput,
): Promise<{ id: string }> {
  const sleep = input.sleep ?? defaultSleep;
  await waitForContainer(input, sleep);

  let lastMessage = "HTTP error";
  for (let attempt = 0; attempt <= PUBLISH_RETRY_DELAYS_MS.length; attempt += 1) {
    const response = await fetch(
      `${metaEndpoint("threads")}/v1.0/${encodeURIComponent(input.userId)}/threads_publish`,
      {
        method: "POST",
        headers: metaRequestHeaders({ "Content-Type": "application/x-www-form-urlencoded" }),
        body: new URLSearchParams({ access_token: input.token, creation_id: input.creationId }),
      },
    );
    const payload = await response.json().catch(() => null) as
      { id?: string; error?: { message?: string } } | null;
    if (response.ok && payload?.id) return { id: payload.id };

    lastMessage = payload?.error?.message ?? `HTTP ${response.status}`;
    const delay = PUBLISH_RETRY_DELAYS_MS[attempt];
    if (delay === undefined || !NOT_READY_PATTERN.test(lastMessage)) break;
    await sleep(delay);
  }
  throw new Error(lastMessage);
}
