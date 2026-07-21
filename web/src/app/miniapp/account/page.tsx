import { AccountScreen } from "@/components/miniapp/journey-screens";

function safeReturnTo(value: string | undefined) {
  return value?.startsWith("/miniapp") && !value.startsWith("//") ? value : "/miniapp/profile";
}

export default async function MiniAppAccountPage({ searchParams }: { searchParams: Promise<{ mode?: string; returnTo?: string }> }) {
  const query = await searchParams;
  return <AccountScreen initialMode={query.mode === "login" ? "login" : "register"} returnTo={safeReturnTo(query.returnTo)} />;
}
