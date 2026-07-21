import type { Metadata, Viewport } from "next";
import { auth } from "@/lib/auth";
import { noIndexRobots } from "@/lib/seo";
import { loadMiniAppInitialData } from "@/lib/miniapp/server-data";
import { MiniAppShell } from "@/components/miniapp/miniapp-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ETerapy Mini App",
  description: "Клиентский Mini App ETerapy",
  robots: noIndexRobots,
};

export const viewport: Viewport = {
  themeColor: "#07111f",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // Без viewport-fit=cover все env(safe-area-inset-*) резолвятся в 0, и нижняя
  // кромка композера/навигации уезжает под системный индикатор iPhone.
  viewportFit: "cover",
  // Клавиатура должна сжимать layout viewport, а не накрывать его: тогда
  // 100dvh, sticky-композер и автоскролл треда считаются от видимой области.
  interactiveWidget: "resizes-content",
};

export default async function MiniAppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const data = await loadMiniAppInitialData(session?.user ?? null);
  return <MiniAppShell data={data}>{children}</MiniAppShell>;
}
