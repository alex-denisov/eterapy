import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCreditWalletSnapshot } from "@/lib/credit-wallet";
import { ProfileSectionScreen } from "@/components/miniapp/journey-screens";
import { MiniAppAboutSettingsScreen, MiniAppDataSettingsScreen, MiniAppInvitesScreen, MiniAppNotificationSettingsScreen, MiniAppSecuritySettingsScreen } from "@/components/miniapp/profile-settings-screens";
import { MiniAppWalletScreen } from "@/components/miniapp/wallet-screen";

const SECTIONS = ["about", "security", "notifications", "data", "bookings", "materials", "wallet", "invites", "subscription"] as const;
type Section = (typeof SECTIONS)[number];

export default async function MiniAppProfileSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!SECTIONS.includes(section as Section)) notFound();
  if (section === "about") return <MiniAppAboutSettingsScreen />;
  if (section === "security") return <MiniAppSecuritySettingsScreen />;
  if (section === "notifications") return <MiniAppNotificationSettingsScreen />;
  if (section === "data") return <MiniAppDataSettingsScreen />;
  if (section === "invites") return <MiniAppInvitesScreen />;
  if (section === "wallet") return <WalletSection />;
  // Здесь остаются только разделы-реестры: у остальных собственные экраны выше.
  return <ProfileSectionScreen section={section as Exclude<Section, "about" | "security" | "notifications" | "data" | "invites" | "wallet">} />;
}

// B554 п.11: настоящий кошелёк вместо двух заглушечных строк — тот же снимок
// баланса, что и в веб-кабинете.
async function WalletSection() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return <MiniAppWalletScreen balance={0} breakdown={[]} history={[]} nearestExpiry={null} />;

  const snapshot = await getCreditWalletSnapshot(userId);
  const expiring = snapshot.breakdown
    .filter((item) => item.expiresAt)
    .sort((a, b) => (a.expiresAt?.getTime() ?? 0) - (b.expiresAt?.getTime() ?? 0))[0];

  return (
    <MiniAppWalletScreen
      balance={snapshot.balance}
      breakdown={snapshot.breakdown.map((item) => ({
        key: item.key,
        label: item.label,
        pointTypeLabel: item.pointTypeLabel,
        amount: item.amount,
        expiryLabel: item.expiryLabel,
      }))}
      history={snapshot.history.map((item) => ({
        id: item.id,
        amount: item.amount,
        balanceAfter: item.balanceAfter,
        typeLabel: item.typeLabel,
        sourceLabel: item.sourceLabel,
        dateLabel: item.createdAt.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }),
      }))}
      nearestExpiry={expiring ? { amount: expiring.amount, label: expiring.expiryLabel } : null}
    />
  );
}
