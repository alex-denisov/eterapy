import type { HumanDesignChart } from "@/lib/human-design-data";

const HUMAN_DESIGN_CHANNEL_NAMES: Readonly<Record<string, string>> = {
  "1-8": "Вдохновение",
  "2-14": "Ритм направления",
  "3-60": "Мутация",
  "5-15": "Ритм",
  "7-31": "Альфа",
  "9-52": "Концентрация",
  "10-20": "Пробуждение",
  "10-34": "Исследование",
  "10-57": "Совершенная форма",
  "11-56": "Любознательность",
  "12-22": "Открытость",
  "13-33": "Свидетель",
  "16-48": "Талант",
  "17-62": "Принятие",
  "18-58": "Суждение",
  "19-49": "Синтез",
  "20-34": "Харизма",
  "20-57": "Интуитивная точность",
  "21-45": "Материальный контур",
  "23-43": "Структурирование",
  "24-61": "Осознание",
  "25-51": "Инициация",
  "26-44": "Передача",
  "27-50": "Сохранение",
  "28-38": "Борьба за смысл",
  "29-46": "Открытие",
  "30-41": "Признание опыта",
  "32-54": "Трансформация",
  "34-57": "Сила",
  "35-36": "Опыт и перемены",
  "37-40": "Сообщество",
  "39-55": "Эмоциональная глубина",
  "42-53": "Созревание",
  "47-64": "Абстракция",
  "57-10": "Совершенная форма",
  "57-20": "Интуитивная точность",
  "59-6": "Близость",
  "63-4": "Логика",
};

export function humanDesignChannelHeading(gates: readonly [number, number]): string {
  const normalized = [...gates].sort((a, b) => a - b).join("-");
  const name = HUMAN_DESIGN_CHANNEL_NAMES[normalized] ?? "определённая связь";
  return `Канал ${gates.join("–")} — ${name}`;
}

export function humanDesignSectionHeadings(chart: HumanDesignChart): string[] {
  const definedCount = chart.centers.filter((center) => center.defined).length;
  const openCount = chart.centers.length - definedCount;
  const channelHeadings = chart.definedChannels.map((channel) => humanDesignChannelHeading(channel.gates));
  const extendedHeading = (body: "chiron" | "lilith", label: string) => {
    const personality = chart.personality.find((activation) => activation.body === body);
    const design = chart.design.find((activation) => activation.body === body);
    return personality && design
      ? `${label} — Личность ${personality.gate}.${personality.line}; Дизайн ${design.gate}.${design.line}`
      : null;
  };
  return [
    `Тип — ${chart.typeName}`,
    `Стратегия — ${chart.strategy}`,
    `Авторитет — ${chart.authorityName}`,
    `Профиль — ${chart.profile}: ${chart.profileName}`,
    `Определение — ${chart.definition}`,
    `Определённые центры — ${definedCount}`,
    `Открытые центры — ${openCount}`,
    ...channelHeadings,
    `Ворота — ${chart.activeGates.length} активных`,
    ...[extendedHeading("chiron", "Хирон"), extendedHeading("lilith", "Лилит, средний лунный апогей")].filter((heading): heading is string => Boolean(heading)),
    `Тема не-я — ${chart.notSelf}; подпись — ${chart.signature}`,
    `Синтез — ${chart.typeName}, профиль ${chart.profile}`,
    `Практика — ${chart.strategy}; ${chart.authorityName}`,
  ];
}

// Saved B499/B501 results used combined generic headings. Preserve their prose,
// but make every visible accordion title concrete to the chart it belongs to.
// Newly generated B503 results already use the fully separated headings above.
export function personalizeHumanDesignResultHeadings(text: string, chart: HumanDesignChart | null): string {
  if (!chart) return text;
  const headings = humanDesignSectionHeadings(chart);
  const definedCount = chart.centers.filter((center) => center.defined).length;
  const openCount = chart.centers.length - definedCount;
  const replacements: Array<[RegExp, string]> = [
    [/^##\s+Тип и стратегия\s*$/gim, `## Тип — ${chart.typeName}; стратегия — ${chart.strategy}`],
    [/^##\s+Внутренний авторитет\s*$/gim, `## ${headings[2]}`],
    [/^##\s+Профиль(?: и роль|\s+\d+\/\d+.*)?\s*$/gim, `## ${headings[3]}`],
    [/^##\s+Центры: где определенность и где восприимчивость\s*$/gim, `## Центры — ${definedCount} определены, ${openCount} открыты`],
    [/^##\s+Каналы и ворота\s*$/gim, `## Каналы и ворота — ${chart.definedChannels.length} каналов, ${chart.activeGates.length} ворот`],
    [/^##\s+Тема не-я и сигналы сбоя\s*$/gim, `## Тема не-я — ${chart.notSelf}; подпись — ${chart.signature}`],
    [/^##\s+Синтез вашего бодиграфа\s*$/gim, `## Синтез — ${chart.typeName}, профиль ${chart.profile}`],
    [/^##\s+Как применять дизайн\s*$/gim, `## Практика — ${chart.strategy}; ${chart.authorityName}`],
  ];
  return replacements.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
}
