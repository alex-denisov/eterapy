// Чистый (client-safe) форматтер «Переосмысления». Результат услуги reframe
// хранится как JSON ({"angles":[…]}), а кабинет/печать рендерят markdown — этот
// модуль переводит JSON в читаемый markdown, чтобы разбор отображался везде
// одинаково. Если на вход пришёл не-JSON (старый формат) — возвращаем как есть.

export type ReframeAngleLike = {
  id?: string;
  title?: string;
  subtitle?: string;
  facts?: unknown;
  unknowns?: unknown;
  options?: unknown;
  ask?: unknown;
  step?: unknown;
};

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function isReframeJson(text: string | null | undefined): boolean {
  if (!text) return false;
  try {
    const raw = JSON.parse(text) as { angles?: unknown };
    return Array.isArray(raw.angles) && raw.angles.length > 0;
  } catch {
    return false;
  }
}

// Конвертация JSON «Переосмысления» в markdown. Не-JSON возвращаем без изменений.
export function reframeToMarkdown(text: string | null | undefined): string {
  if (!text) return "";
  let parsed: { angles?: unknown } | null = null;
  try {
    parsed = JSON.parse(text) as { angles?: unknown };
  } catch {
    return text;
  }
  if (!parsed || !Array.isArray(parsed.angles)) return text;

  const blocks: string[] = [];
  for (const raw of parsed.angles as ReframeAngleLike[]) {
    if (!raw || typeof raw !== "object") continue;
    const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "Угол";
    const subtitle = typeof raw.subtitle === "string" ? raw.subtitle.trim() : "";
    const facts = asStringList(raw.facts);
    const unknowns = asStringList(raw.unknowns);
    const options = asStringList(raw.options);
    const ask = typeof raw.ask === "string" ? raw.ask.trim() : "";
    const step = typeof raw.step === "string" ? raw.step.trim() : "";

    const lines: string[] = [`## ${title}`];
    if (subtitle) lines.push(`_${subtitle}_`, "");
    if (facts.length) {
      lines.push("**Что я вижу**", ...facts.map((f) => `- ${f}`), "");
    }
    if (unknowns.length) {
      lines.push("**Что стоит уточнить**", ...unknowns.map((u) => `- ${u}`), "");
    }
    if (options.length) {
      lines.push("**Что можно сделать**", ...options.map((o) => `- ${o}`), "");
    }
    if (ask) lines.push(`**Вопрос к себе:** «${ask}»`, "");
    if (step) lines.push(`**Следующий шаг:** ${step}`, "");
    blocks.push(lines.join("\n").trim());
  }

  return blocks.join("\n\n");
}
