import type { MiniAppFeature, MiniAppViewId } from "@/lib/miniapp/types";

export const MINIAPP_FEATURES: readonly MiniAppFeature[] = [
  { id: "home", label: "Главная", route: "/miniapp" },
  { id: "dialogues", label: "Диалоги", route: "/miniapp/dialogues" },
  { id: "services", label: "Услуги", route: "/miniapp/services", central: true },
  { id: "diary", label: "Дневник", route: "/miniapp/diary", protected: true },
  { id: "profile", label: "Профиль", route: "/miniapp/profile" },
] as const;

export function miniAppFeatureForPath(pathname: string): MiniAppFeature {
  const normalized = pathname.replace(/\/+$/, "") || "/miniapp";
  return MINIAPP_FEATURES.find((feature) => feature.route === normalized) ?? MINIAPP_FEATURES[0];
}

export function miniAppRoute(view: MiniAppViewId): string {
  return MINIAPP_FEATURES.find((feature) => feature.id === view)?.route ?? "/miniapp";
}
