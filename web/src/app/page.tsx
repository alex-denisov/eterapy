import { auth } from "@/lib/auth";
import { HeroSection } from "@/components/landing/hero";
import { HowItWorksSection } from "@/components/landing/how-it-works";
import { AIToolsSection } from "@/components/landing/ai-tools";
import { ForPractitionersSection } from "@/components/landing/for-practitioners";
import { TrustSection } from "@/components/landing/trust";
import { FAQSection } from "@/components/landing/faq";
import { CTASection } from "@/components/landing/cta";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { HomeAnalytics } from "@/components/landing/home-analytics";

export default async function Home() {
  await auth();

  return (
    <div className="soft-clarity-page" data-ui-version="design-v4-soft-clarity">
      <PublicJsonLd route="/" />
      <HomeAnalytics />
      <HeroSection />
      <HowItWorksSection />
      <AIToolsSection />
      <TrustSection />
      <ForPractitionersSection />
      <FAQSection />
      <CTASection />
    </div>
  );
}
