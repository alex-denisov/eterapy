/**
 * B734 — РЕДАКТОР ПЕРЕСТАЁТ БЫТЬ КОНТРОЛЁРОМ НА ВХОДЕ.
 *
 * Замер прода за 10 суток: 74 материала, 176 раундов, 85 % вердиктов `REVISE`,
 * с первого раунда утверждается 11 материалов из 74, средний `platformFit`
 * 2,65 из 5 — самая низкая оценка корпуса, а инлайн-правка (`revisedText`)
 * заполняется в 7 раундах из 150.
 *
 * Проверяется здесь ТЕКСТ ПРОМТА, и это осознанно: поведение модели прогоном не
 * измеришь, а вот исчезнувшую формулировку — измеришь. Именно так и пропадали
 * прежние правки промтов: строка возвращалась при следующей редактуре файла, и
 * никто не замечал ([[reference_prompt_change_invisible_until_queue_drains]]).
 *
 * Настоящая приёмка — замер D+14 теми же тремя числами: `platformFit`, доля
 * `revisedText`, доля утверждённых с первого раунда.
 */

import {
  MARKETING_REVIEWER_SYSTEM_PROMPT,
  MARKETING_SMM_REVIEWER_SYSTEM_PROMPT,
} from "@/lib/marketing/agent-prompt";
import {
  MARKETING_REVIEWER_MAX_TOKENS,
  MARKETING_MAX_STRUCTURED_OUTPUT_TOKENS,
} from "@/lib/marketing/agent";

describe("B734 — редактор не рубит материал за необычность", () => {
  it("platformFit сформулирован как проверка ОГРАНИЧЕНИЙ, а не похожести на типичный пост", () => {
    const prompt = MARKETING_REVIEWER_SYSTEM_PROMPT;
    expect(prompt).toContain("ПРОВЕРКА ОГРАНИЧЕНИЙ, А НЕ ПОХОЖЕСТЬ НА ТИПИЧНЫЙ ПОСТ");
    // Свободная форма названа НЕ дефектом прямым текстом: без этого редактор
    // снижает оценку «за нестандартность» и не может назвать нарушение.
    expect(prompt).toMatch(/САМА ПО\s+СЕБЕ НЕ ДЕФЕКТ/);
    expect(prompt).toMatch(/КОНКРЕТНОЕ нарушенное ограничение/);
  });

  it("инлайн-правка требуется ПРИМЕРОМ, а не только правилом", () => {
    const prompt = MARKETING_REVIEWER_SYSTEM_PROMPT;
    // Правило было и раньше — и игнорировалось в 95 % раундов. Проверяем
    // именно пример «вход → готовый исправленный текст».
    expect(prompt).toContain("ПЛОХО:");
    expect(prompt).toContain("ХОРОШО:");
    expect(prompt).toMatch(/candidate: «/);
    expect(prompt).toContain("Ты РЕДАКТОР, А НЕ КОНТРОЛЁР НА ВХОДЕ");
  });

  it("строки «не смягчай критерии» в промте поста больше нет", () => {
    // Прямой тормоз сходимости: она запрещала принять доработанное и
    // превращала второй раунд в поиск нового замечания.
    expect(MARKETING_REVIEWER_SYSTEM_PROMPT).not.toMatch(/не смягчай критерии/);
    expect(MARKETING_REVIEWER_SYSTEM_PROMPT).toMatch(/суди ДОРАБОТАННЫЙ текст/);
    // У редактора ОТВЕТОВ ЧЕЛОВЕКУ рубрика другая и в замер не входила —
    // менять по одному, иначе непонятно, что сработало.
    expect(MARKETING_SMM_REVIEWER_SYSTEM_PROMPT).toMatch(/не смягчай критерии/);
  });

  it("потолок вывода редактора уже равен максимуму — поднимать нечего", () => {
    // Ticket предупреждал: доводка требует полного текста в ответе, и при
    // низком потолке ответ обрежется СВОИМ лимитом и будет выглядеть как отказ
    // провайдера ([[reference_max_tokens_masquerades_as_provider_failure]]).
    // Ступень снята ещё в B718: старт равен потолку.
    expect(MARKETING_REVIEWER_MAX_TOKENS).toBe(MARKETING_MAX_STRUCTURED_OUTPUT_TOKENS);
  });
});
