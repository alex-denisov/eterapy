import type { MiniAppFeature, MiniAppViewId } from "@/lib/miniapp/types";

export const MINIAPP_FEATURES: readonly MiniAppFeature[] = [
  { id: "home", label: "Главная", route: "/miniapp" },
  { id: "dialogues", label: "Диалоги", route: "/miniapp/dialogues" },
  // B594/B606: одно название входа в каталог на всех поверхностях — глагол,
  // называющий действие. «Услуги» читалось как «мои услуги» и ничего не обещало.
  { id: "services", label: "Разобрать", route: "/miniapp/services", central: true },
  { id: "diary", label: "Дневник", route: "/miniapp/diary", protected: true },
  { id: "profile", label: "Профиль", route: "/miniapp/profile" },
] as const;

export function miniAppFeatureForPath(pathname: string): MiniAppFeature {
  const normalized = pathname.replace(/\/+$/, "") || "/miniapp";
  const routedOwner: Partial<Record<string, MiniAppViewId>> = {
    "/miniapp/practitioners": "services",
    "/miniapp/packages": "services",
    "/miniapp/checkout": "services",
    "/miniapp/checkin": "dialogues",
    "/miniapp/products": "services",
    "/miniapp/results": "diary",
    "/miniapp/materials": "profile",
    "/miniapp/session": "profile",
    "/miniapp/library": "dialogues",
    "/miniapp/account": "profile",
  };
  const owner = Object.entries(routedOwner)
    .sort(([left], [right]) => right.length - left.length)
    .find(([prefix]) => normalized === prefix || normalized.startsWith(`${prefix}/`))?.[1];
  if (owner) return MINIAPP_FEATURES.find((feature) => feature.id === owner) ?? MINIAPP_FEATURES[0];
  return [...MINIAPP_FEATURES]
    .sort((left, right) => right.route.length - left.route.length)
    .find((feature) => normalized === feature.route || (feature.route !== "/miniapp" && normalized.startsWith(`${feature.route}/`)))
    ?? MINIAPP_FEATURES[0];
}

export function miniAppRoute(view: MiniAppViewId): string {
  return MINIAPP_FEATURES.find((feature) => feature.id === view)?.route ?? "/miniapp";
}
