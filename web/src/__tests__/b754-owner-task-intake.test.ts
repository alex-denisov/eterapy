/**
 * B754 — разбор поручения владельца. Модель выдаёт JSON, исполняет только код:
 * действие вне белого списка превращается в «очередь», а не в выполнение.
 */
import { INTAKE_ACTIONS, parseIntakePlan } from "@/lib/marketing/owner-task-intake";

describe("parseIntakePlan", () => {
  it("принимает настройку из словаря", () => {
    const plan = parseIntakePlan('{"understood":"поднять норму выпуска до 3","action":"set_setting","payload":{"key":"seo.pages_per_day","value":3}}');
    expect(plan?.directive?.action).toBe("set_setting");
    expect(plan?.directive?.payload.value).toBe(3);
  });

  it("терпит текст вокруг JSON", () => {
    const plan = parseIntakePlan('Вот разбор:\n{"understood":"x","action":"none"}\nготово');
    expect(plan).toEqual({ understood: "x", directive: null });
  });

  it("действие вне белого списка не исполняется — задача уходит в очередь", () => {
    for (const action of ["update_prompt", "toggle_provider", "drop_table", "set_price"]) {
      const plan = parseIntakePlan(`{"understood":"x","action":"${action}","payload":{}}`);
      expect(plan?.directive).toBeNull();
    }
    expect(INTAKE_ACTIONS.has("update_prompt")).toBe(false);
    expect(INTAKE_ACTIONS.has("toggle_provider")).toBe(false);
  });

  it("мусор и ответ без «как понял» — не план", () => {
    expect(parseIntakePlan("не json")).toBeNull();
    expect(parseIntakePlan('{"action":"set_setting"}')).toBeNull();
    expect(parseIntakePlan('{"understood":"  "}')).toBeNull();
  });
});
