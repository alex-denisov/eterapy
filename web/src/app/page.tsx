import { auth } from "@/lib/auth";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { HeroSection } from "@/components/landing/hero";
import { HowItWorksSection } from "@/components/landing/how-it-works";
import { AIToolsSection } from "@/components/landing/ai-tools";
import { EsotericShowcaseSection } from "@/components/landing/esoteric-showcase";
import { LibraryPreviewSection } from "@/components/landing/library-preview";
import { SpecialistsTeaserSection } from "@/components/landing/specialists-teaser";
import { ForPractitionersSection } from "@/components/landing/for-practitioners";
import { GrowthFormatsSection } from "@/components/landing/growth-formats";
import { TrustPromisesSection, TrustPrivacySection } from "@/components/landing/trust";
import { CTASection } from "@/components/landing/cta";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { HomeAnalytics } from "@/components/landing/home-analytics";

export const metadata = createPublicPageMetadata("/");

export default async function Home() {
  await auth();

  return (
    <div className="soft-clarity-page" data-ui-version="design-v4-2-soft-clarity">
      <PublicJsonLd route="/" />
      <HomeAnalytics />
      <HeroSection />
      <HowItWorksSection />
      <AIToolsSection />
      <EsotericShowcaseSection />
      <GrowthFormatsSection />
      <LibraryPreviewSection />
      <SpecialistsTeaserSection />
      <TrustPromisesSection />
      <TrustPrivacySection />
      <ForPractitionersSection />
      <CTASection />
    </div>
  );
}
