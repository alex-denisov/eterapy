import { createPublicPageMetadata } from "@/lib/public-page-seo";

export const metadata = createPublicPageMetadata("/help");

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
