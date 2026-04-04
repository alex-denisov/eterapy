/**
 * Отложенная аутентификация для инструментов.
 * 
 * Пользователь заполняет форму → нажимает "Рассчитать" →
 * если не авторизован: сохраняем форму в sessionStorage → показываем модалку регистрации →
 * после входа: восстанавливаем форму, продолжаем с того места.
 */

const PREFIX = "eterapy_deferred_";

export const deferredAuth = {
  save(tool: string, data: Record<string, unknown>) {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(PREFIX + tool, JSON.stringify({ data, savedAt: Date.now() }));
  },

  restore(tool: string): Record<string, unknown> | null {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem(PREFIX + tool);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      // Не восстанавливаем если данные старше 30 минут
      if (Date.now() - parsed.savedAt > 30 * 60 * 1000) {
        this.clear(tool);
        return null;
      }
      return parsed.data;
    } catch {
      return null;
    }
  },

  clear(tool: string) {
    if (typeof window === "undefined") return;
    sessionStorage.removeItem(PREFIX + tool);
  },

  hasData(tool: string): boolean {
    if (typeof window === "undefined") return false;
    return !!sessionStorage.getItem(PREFIX + tool);
  },
};
