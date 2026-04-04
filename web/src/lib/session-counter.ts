/**
 * Счётчик использований инструментов.
 * Хранится в localStorage, сбрасывается раз в месяц.
 * В будущем будет заменён серверным учётом.
 */

const KEY = "eterapy_tool_usage";
const LIMIT = 3;

interface UsageData {
  month: string; // "2026-04"
  count: number;
}

function getMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function load(): UsageData {
  if (typeof window === "undefined") return { month: getMonthKey(), count: 0 };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { month: getMonthKey(), count: 0 };
    const data: UsageData = JSON.parse(raw);
    // Сбрасываем если новый месяц
    if (data.month !== getMonthKey()) return { month: getMonthKey(), count: 0 };
    return data;
  } catch {
    return { month: getMonthKey(), count: 0 };
  }
}

function save(data: UsageData): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(data));
}

export const sessionCounter = {
  get(): UsageData {
    return load();
  },

  getRemaining(): number {
    return Math.max(0, LIMIT - load().count);
  },

  /** Возвращает false если лимит исчерпан */
  increment(): boolean {
    const data = load();
    if (data.count >= LIMIT) return false;
    save({ ...data, count: data.count + 1 });
    return true;
  },

  limit: LIMIT,
};
