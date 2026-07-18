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
};

export default async function MiniAppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const data = await loadMiniAppInitialData(session?.user ?? null);
  return <MiniAppShell data={data}>{children}</MiniAppShell>;
}
