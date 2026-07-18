import { notFound } from "next/navigation";
import { ProfileSectionScreen } from "@/components/miniapp/journey-screens";
import { MiniAppAboutSettingsScreen, MiniAppDataSettingsScreen, MiniAppInvitesScreen, MiniAppNotificationSettingsScreen, MiniAppSecuritySettingsScreen } from "@/components/miniapp/profile-settings-screens";

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
  return <ProfileSectionScreen section={section as Section} />;
}
