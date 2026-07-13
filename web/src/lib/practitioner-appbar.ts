import { getActivePractitionerPlanKey } from "@/lib/practitioner-entitlements";
import { practitionerTierBadge, practitionerTierFromPlanKey } from "@/lib/practitioner-tier";

// B466 R9-4 — единый сборщик данных appbar кокпита практика (аватар-инициалы,
// имя, чип тарифа, подзаголовок-специализация). Один источник для всех
// верхнеуровневых мобильных экранов (Сегодня/Клиенты/Календарь/Финансы), чтобы
// «верх» был идентичным. Подписи/цвета — из mockup-CSS через .pcab-appbar.

export interface PractitionerAppbarData {
  initials: string;
  name: string;
  tierLabel: string;
  subtitle: string | null;
}

/** Инициалы (до двух слов) для градиентного аватара appbar. */
export function practitionerInitials(label: string): string {
  const letters = label
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return letters || "?";
}

/**
 * Собирает данные appbar из уже загруженного практика. `tier` берётся из
 * активной подписки (одна доп. выборка на страницу — все эти экраны
 * force-dynamic). Передавайте поля user (name/email) и title практика.
 */
export async function loadPractitionerAppbar(input: {
  userId: string;
  name: string | null;
  email: string | null;
  title: string | null;
}): Promise<PractitionerAppbarData> {
  const planKey = await getActivePractitionerPlanKey(input.userId);
  const tier = practitionerTierFromPlanKey(planKey);
  const displayName = input.name ?? input.email ?? "Специалист";
  return {
    initials: practitionerInitials(displayName),
    name: displayName,
    tierLabel: practitionerTierBadge(tier),
    subtitle: input.title,
  };
}
