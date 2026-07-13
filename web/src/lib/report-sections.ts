// Общий разбор markdown-документа на главы по заголовкам «## …». Используется
// несколькими услугами (deep-report, natal-chart, …), чтобы длинный результат
// раскладывался в навигацию-аккордеон. Преамбулу до первого заголовка (если есть)
// присоединяем к первой главе. Чистая функция — без server-импортов, безопасна
// и для клиентского бандла.

export type ReportSection = { title: string; body: string };

const PRODUCT_SECTION_TITLES: Record<string, string[]> = {
  tarot: ["Картина расклада", "Связь карт и скрытая линия", "Ответ расклада", "Вероятная динамика", "Предупреждение карт", "Связь карт между собой", "Что карты подсвечивают прямо сейчас", "Как действовать по раскладу", "Чего не стоит делать"],
  "natal-chart": ["Главная конфигурация карты", "Солнце, стихия и модальность", "Луна, Асцендент и личные планеты", "Луна, Асцендент и личные планеты как темы", "Дома и сферы жизни", "Аспекты: где напряжение и где ресурс", "Персональный синтез карты", "Ответ на ваш вопрос", "Как читать эту карту в жизни", "Как работать с этой картой дальше"],
  synastry: ["Общий рисунок связи", "Притяжение и ресурс пары", "Где возникают трения", "Разные темпы и ожидания", "Коммуникация и конфликт", "Главная динамика вашей пары", "Ответ на вопрос пары", "Что показывает карта отношений", "Что проверить в реальном разговоре"],
  numerology: ["Карта чисел", "Сильные стороны и теневая сторона", "Повторяющийся сценарий", "Синтез числового портрета", "Ответ на ваш вопрос", "Практический ориентир на ближайшее время"],
  "human-design": ["Тип и стратегия", "Внутренний авторитет", "Профиль и роль", "Центры: где определенность и где восприимчивость", "Каналы и ворота", "Тема не-я и сигналы сбоя", "Синтез вашего бодиграфа", "Ответ на ваш вопрос", "Как применять дизайн"],
  "surname-story": ["Что говорит форма фамилии", "Вероятные корни и версии происхождения", "География и исторический контекст", "Профессия, статус или прозвище предка", "Известные ассоциации и тёмные версии", "Факты, версии и границы достоверности", "Что проверить в семейной истории", "Итог исследования фамилии", "Ответ на ваш вопрос"],
  "deep-report": ["Суть запроса и фактическая картина", "Ключевая динамика", "Гипотезы: как это могло сложиться", "Что поддерживает проблему сейчас", "Ресурсы, ограничения и риски", "Развилки решения", "План действий на 7–14 дней", "Когда подключать специалиста"],
};

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeResultSectionHeadings(productKey: string, text: string): string {
  let normalized = text.replace(/\r\n/g, "\n");
  for (const title of PRODUCT_SECTION_TITLES[productKey] ?? []) {
    const titlePattern = escapeRegex(title);
    normalized = normalized.replace(
      new RegExp(`(^|\\n)\\s*(?:#{1,4}\\s*)?(?:\\*\\*)?(?:\\d{1,2}[.)]\\s*)?${titlePattern}(?:\\*\\*)?\\s*:?[ \\t]*(?=\\n|$)`, "gim"),
      (_match, prefix: string) => `${prefix}## ${title}`,
    );
    normalized = normalized.replace(
      new RegExp(`(^|\\n)\\s*(?:#{1,4}\\s*)?(?:\\*\\*)?(?:\\d{1,2}[.)]\\s*)?${titlePattern}(?:\\*\\*)?\\s*[.:—-]\\s+`, "gim"),
      (_match, prefix: string) => `${prefix}## ${title}\n`,
    );
  }
  return normalized;
}

export function splitSections(md: string): ReportSection[] {
  const lines = md.split("\n");
  const sections: ReportSection[] = [];
  let current: ReportSection | null = null;
  let preamble = "";
  for (const line of lines) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) {
      if (current) sections.push(current);
      current = { title: match[1].trim(), body: "" };
    } else if (current) {
      current.body += `${line}\n`;
    } else {
      preamble += `${line}\n`;
    }
  }
  if (current) sections.push(current);
  if (sections.length > 0 && preamble.trim()) {
    sections[0] = { ...sections[0], body: `${preamble.trim()}\n\n${sections[0].body}` };
  }
  return sections.map((s) => ({ title: s.title, body: s.body.trim() }));
}
