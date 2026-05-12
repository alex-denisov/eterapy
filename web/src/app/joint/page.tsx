import { JointSessionPage } from "@/components/public/esoteric-soon-page";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";

export const metadata = createPublicPageMetadata("/joint");

export default function JointPage() {
  return (
    <>
      <PublicJsonLd route="/joint" />
      <JointSessionPage />
    </>
  );
}
