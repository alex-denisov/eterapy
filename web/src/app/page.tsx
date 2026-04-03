import { HeroSection } from "@/components/landing/hero";
import { HowItWorksSection } from "@/components/landing/how-it-works";
import { AIToolsSection } from "@/components/landing/ai-tools";
import { ForPractitionersSection } from "@/components/landing/for-practitioners";
import { TrustSection } from "@/components/landing/trust";
import { FAQSection } from "@/components/landing/faq";
import { CTASection } from "@/components/landing/cta";

export default function Home() {
  return (
    <>
      <HeroSection />
      <HowItWorksSection />
      <AIToolsSection />
      <TrustSection />
      <ForPractitionersSection />
      <FAQSection />
      <CTASection />
    </>
  );
}
