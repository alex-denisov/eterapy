import { notFound } from "next/navigation";
import { ProfileSectionScreen } from "@/components/miniapp/journey-screens";

const SECTIONS = ["about", "security", "notifications", "data", "bookings", "materials", "wallet", "invites", "subscription"] as const;
type Section = (typeof SECTIONS)[number];

export default async function MiniAppProfileSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!SECTIONS.includes(section as Section)) notFound();
  return <ProfileSectionScreen section={section as Section} />;
}
