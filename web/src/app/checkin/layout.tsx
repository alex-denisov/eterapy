import { createPublicPageMetadata } from "@/lib/public-page-seo";

export const metadata = createPublicPageMetadata("/checkin");

export default function CheckinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
