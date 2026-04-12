import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { HeroSection } from "@/components/landing/hero";
import { HowItWorksSection } from "@/components/landing/how-it-works";
import { AIToolsSection } from "@/components/landing/ai-tools";
import { ForPractitionersSection } from "@/components/landing/for-practitioners";
import { TrustSection } from "@/components/landing/trust";
import { FAQSection } from "@/components/landing/faq";
import { CTASection } from "@/components/landing/cta";

export default async function Home() {
  const session = await auth();
  if (session?.user) {
    const role = (session.user as any).role;
    if (role === "PRACTITIONER") redirect("/cabinet/practitioner");
    if (role === "ADMIN" || role === "SUPERADMIN") redirect("/admin");
    redirect("/cabinet");
  }

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
