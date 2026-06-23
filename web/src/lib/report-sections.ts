// Общий разбор markdown-документа на главы по заголовкам «## …». Используется
// несколькими услугами (deep-report, natal-chart, …), чтобы длинный результат
// раскладывался в навигацию-аккордеон. Преамбулу до первого заголовка (если есть)
// присоединяем к первой главе. Чистая функция — без server-импортов, безопасна
// и для клиентского бандла.

export type ReportSection = { title: string; body: string };

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
