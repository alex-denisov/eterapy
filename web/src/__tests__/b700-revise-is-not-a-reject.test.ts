/**
 * B700 фаза 6 (страховка) — «поправимо» не значит «в брак».
 *
 * ЧТО СЛУЧИЛОСЬ. Замер прода 2026-08-10: 10 материалов ушли в архив, у ВСЕХ три
 * `REVISE` подряд и ни одного `REJECT`. Редактор трижды писал «правки минимальны
 * и не затрагивают смысл», после чего материал выбрасывался по исчерпанию
 * кругов, а прошедший слот отправлял строку в архив.
 *
 * ПОЧЕМУ СТРАХОВКУ НЕ ПОСТАВИЛИ СРАЗУ. Пока раунды не сходились (каждый раунд
 * приносил НОВЫЙ список замечаний вместо проверки старого), возврат на склад
 * означал бы вечную доработку. Страховка была отложена до замера сходимости.
 *
 * ЗАМЕР 2026-08-11 ПОКАЗАЛ СХОДИМОСТЬ дословно из журнала прода:
 * «Неустранённые дефекты из прошлого раунда: превышение лимита символов и
 * отсутствие сухой самоиронии. Новые блокирующие замечания отсутствуют».
 * Замечания ПОВТОРЯЮТСЯ, а не заменяются, — и материал всё равно умирал. Один
 * из них — за девять лишних символов: «После уменьшения текста на ≥9 символов
 * материал будет готов к публикации».
 *
 * ГРАНИЦЫ, КОТОРЫЕ ДЕРЖИТ ЭТОТ ТЕСТ:
 *   1. `REVISE` на исчерпанном круге возвращает материал на склад, а не в брак;
 *   2. склад несёт замечания последнего раунда — следующий проход правит, а не
 *      пишет заново;
 *   3. `REJECT` исполняется сразу: приговор редактора страховкой не отменяется;
 *   4. круги считаются ПОЖИЗНЕННО — исчерпав их, материал уходит в брак честно.
 */

import { processMarketingDraft } from "@/lib/marketing/agent";

const aiComplete = jest.fn();
const findUnique = jest.fn();
const update = jest.fn();

jest.mock("@/lib/marketing/pool-capacity", () => ({
  __esModule: true,
  marketingPoolAvailability: async () => ({
    providers: ["GROQ", "GEMINI"],
    canSeparateRoles: true,
  }),
  marketingHourlyCapacity: async () => ({
    perHour: 2,
    materialsLeftToday: 2,
    providers: ["GROQ", "GEMINI"],
    canSeparateRoles: true,
  }),
  marketingPoolResumeAt: async () => null,
}));

jest.mock("@/lib/ai", () => ({
  __esModule: true,
  aiComplete: (...args: unknown[]) => aiComplete(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    externalPublication: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: (...args: unknown[]) => update(...args),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    platformSetting: { findUnique: jest.fn().mockResolvedValue({ value: "true" }) },
    marketingAutomationSignal: { upsert: jest.fn(), updateMany: jest.fn() },
  },
}));

jest.mock("@/lib/marketing/research", () => ({
  __esModule: true,
  buildMarketingResearchBrief: jest.fn().mockResolvedValue({ facts: [] }),
}));

jest.mock("@/lib/marketing/moderation", () => ({
  __esModule: true,
  requestMarketingModeration: jest.fn().mockResolvedValue(undefined),
}));

const WRITER_TEXT = "Расставание редко заканчивается в тот день, когда закончились отношения. "
  + "Проверьте одно: о ком вы скучаете — о человеке или о том, каким были рядом с ним. "
  + "Ответ на этот вопрос обычно и есть следующий шаг.";

const WRITER_ANSWER = JSON.stringify({
  title: "Почему расставание длится дольше отношений",
  text: WRITER_TEXT,
  audienceNeed: "понять своё состояние",
  goal: "дать один наблюдаемый шаг",
  disclosure: "",
  cta: "Разобрать спокойно: https://eterapy.com/library/kak-perezhit-rasstavanie-s-lyubimym",
  mediaBrief: "спокойная абстрактная обложка в тёплых тонах",
  researchUsed: [],
  safetyFlags: [],
});

function reviewerAnswer(decision: "REVISE" | "REJECT") {
  return JSON.stringify({
    decision,
    scores: {
      relevance: 5, value: 5, authenticity: 5, safety: 5, platformFit: 3,
      completeness: 5, language: 5, cta: 5, visual: 5, antiSlop: 5,
    },
    /*
     * B705 §23: замечание здесь обязано быть по СУЩЕСТВУ. Прежде фикстура
     * говорила «превышение лимита площадки на девять символов» — с тех пор как
     * считаемые свойства судит машина, такое замечание снимается до решения, и
     * материал утверждается, не доходя до страховки. Предмет этого теста —
     * возврат на склад после трёх REVISE, а не подсчёт символов.
     */
    issues: ["Совет дан в лоб и не опирается ни на один конкретный пример"],
    revisionBrief: ["Добавить конкретный пример из практики"],
    revisedText: "",
    summary: decision === "REVISE"
      ? "Неустранённые дефекты из прошлого раунда: совет без опоры на пример. Новых блокирующих замечаний нет."
      : "Материал не соответствует теме и не может быть выпущен.",
  });
}

const PLANNED_ROW = {
  id: "pub-1",
  key: "b610-2w-telegram-20260811-01",
  planSlot: "b610-2w-telegram-20260811-01",
  status: "DRAFT",
  platform: "telegram",
  title: "Почему расставание длится дольше отношений",
  contentType: "POST",
  cluster: "расставание и возврат",
  targetQuery: "как пережить расставание",
  notes: JSON.stringify({ format: "утренняя символическая карточка" }),
  destinationUrl: "https://eterapy.com/library/kak-perezhit-rasstavanie-s-lyubimym",
  engagementExcerpt: null,
  engagementTargetLabel: null,
  engagementTargetUrl: null,
  engagementTargetId: null,
  engagementTone: null,
  scheduledFor: new Date("2026-08-11T05:30:00.000Z"),
  attemptCount: 0,
  agentWriterDraft: null,
  agentWrittenAt: null,
  agentReviewedAt: null,
};

const writes = () => update.mock.calls.map((call) => (call[0] as {
  data: Record<string, unknown>;
}).data);

function answerWith(decision: "REVISE" | "REJECT") {
  aiComplete.mockImplementation((input: { feature: string }) =>
    Promise.resolve(input.feature.includes("writer")
      ? { text: WRITER_ANSWER, provider: "GROQ", model: "qwen/qwen3.6-27b", finishReason: "STOP" }
      : { text: reviewerAnswer(decision), provider: "GEMINI", model: "gemini-3.5-flash", finishReason: "STOP" }));
}

beforeEach(() => {
  aiComplete.mockReset();
  findUnique.mockReset().mockResolvedValue(PLANNED_ROW);
  update.mockReset().mockImplementation((args: { data: unknown }) =>
    Promise.resolve({ id: "pub-1", ...(args.data as object) }));
});

describe("B700 фаза 6 · исчерпанный круг правки не выбрасывает материал", () => {
  /**
   * B718 — ИСХОД СТРАХОВКИ СТАЛ ВЫПУСКОМ, А НЕ ВТОРЫМ ПРОХОДОМ.
   *
   * Обещание фазы 6 — «материал с вердиктом REVISE не идёт в брак» —
   * выполняется по-прежнему, и это главное, что меряет прогон. Изменился
   * СПОСОБ: раньше исчерпанный круг возвращал материал на склад ещё на один
   * оплаченный проход (пожизненный рубеж был 6 = два круга по три), теперь
   * пожизненный рубеж равен кругу, и на выходе работает страховка B713 —
   * выпуск лучшего черновика с пометкой о незакрытых замечаниях.
   *
   * Причина замера: 623 успешные рецензии за неделю на 14 выпущенных
   * материалов, при этом дословные вердикты второго круга — «Неустранённые
   * дефекты из прошлого раунда … Новых блокирующих замечаний нет». Второй круг
   * не сходился, он повторялся. Выпустить лучшее дешевле и полезнее, чем
   * заплатить за тот же вердикт ещё раз.
   *
   * ⚠ ГРАНИЦА НЕ СДВИНУТА: REJECT, флаг безопасности и пустой текст наружу
   * по-прежнему не выпускаются — это проверяют соседние прогоны файла.
   */
  it("три REVISE подряд — материал выпускается лучшим черновиком, а не в брак", async () => {
    answerWith("REVISE");

    const result = await processMarketingDraft("pub-1");

    expect(result.status).toBe("scheduled");
    expect(writes().some((data) => data.status === "FAILED")).toBe(false);
  });

  it("выпуск без полного одобрения несёт незакрытые замечания дальше", async () => {
    answerWith("REVISE");

    await processMarketingDraft("pub-1");

    // Материал ушёл в расписание, и его текст — тот, что писал автор.
    const scheduled = writes().find((data) => data.status === "SCHEDULED");
    expect(scheduled).toBeDefined();
    expect(String(scheduled!.body)).toContain("о ком вы скучаете");
    // Решение редактора зафиксировано: владелец видит, что одобрения не было.
    expect(writes().some((data) => data.agentReview)).toBe(true);
  });

  it("REJECT исполняется сразу: приговор редактора страховкой не отменяется", async () => {
    answerWith("REJECT");

    const result = await processMarketingDraft("pub-1");

    expect(result.status).toBe("rejected");
    const failed = writes().find((data) => data.status === "FAILED");
    expect(failed).toBeDefined();
    expect(failed!.agentReviewedAt).toBeInstanceOf(Date);
  });

  /**
   * B713 §3 изменил исход этой ветки по решению владельца 2026-08-17.
   *
   * Было: пожизненные круги кончились → материал в брак. Замер прода
   * 03.08–17.08 показал цену такого исхода — 21 смерть там, где редактор
   * возражал по одному пункту и сам признавал остальное годным («превышение
   * лимита на 48 символов не устранено, остальные параметры соответствуют
   * требованиям»).
   *
   * Стало: выпускается ЛУЧШИЙ из написанных черновиков, а владелец узнаёт об
   * этом пометкой. Брак остаётся ровно там, где выпускать нечего или нельзя, —
   * приговор `REJECT`, флаг безопасности, пустой текст.
   */
  it("пожизненные круги исчерпаны — выпускается лучший черновик, а не брак", async () => {
    answerWith("REVISE");
    findUnique.mockResolvedValue({
      ...PLANNED_ROW,
      agentWriterDraft: {
        round: 1,
        // Шесть кругов — потолок: седьмого не будет.
        lifetimeRounds: 6,
        research: { facts: [] },
        iterationHistory: [],
        previousDraft: JSON.parse(WRITER_ANSWER),
        previousReview: JSON.parse(reviewerAnswer("REVISE")),
        pending: null,
      },
      agentWrittenAt: new Date("2026-08-11T04:00:00.000Z"),
    });

    const result = await processMarketingDraft("pub-1");

    expect(result.status).toBe("scheduled");
    expect(writes().some((data) => data.status === "FAILED")).toBe(false);
    // Материал обязан нести на себе, что круги не сошлись, а кончились.
    const released = writes().find((data) => data.status === "SCHEDULED");
    expect(String(released?.lastError)).toContain("без полного одобрения");
  });

  it("приговор REJECT остаётся браком и после исчерпания кругов", async () => {
    answerWith("REJECT");
    findUnique.mockResolvedValue({
      ...PLANNED_ROW,
      agentWriterDraft: {
        round: 1,
        lifetimeRounds: 6,
        research: { facts: [] },
        iterationHistory: [],
        previousDraft: JSON.parse(WRITER_ANSWER),
        previousReview: JSON.parse(reviewerAnswer("REJECT")),
        pending: null,
      },
      agentWrittenAt: new Date("2026-08-11T04:00:00.000Z"),
    });

    const result = await processMarketingDraft("pub-1");

    expect(result.status).toBe("rejected");
    expect(writes().some((data) => data.status === "FAILED")).toBe(true);
  });
});
