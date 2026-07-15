import { auth } from "@/lib/auth";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { HeroSection } from "@/components/landing/hero";
import { ScenariosSection } from "@/components/landing/scenarios";
import { HowItWorksSection } from "@/components/landing/how-it-works";
import { LibraryPreviewSection } from "@/components/landing/library-preview";
import { CTASection } from "@/components/landing/cta";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { HomeAnalytics } from "@/components/landing/home-analytics";
import { HomeAuthorityArticle } from "@/components/landing/authority-article";

export const metadata = createPublicPageMetadata("/");

// B374: lean, dialogue-first landing (≤6 mobile screens). The hero question
// entry is the single funnel entry; three scenario-routers sit below for people
// not ready to type. The 21-card service «простыня», esoteric service chips, the
// standalone growth widget, the B2B practitioners block, the specialists teaser
// and the duplicate "помогаем/не обещаем" panel were removed from the landing —
// services live in /products (5 groups), specialists on /practitioners, B2B on
// /practitioners/apply (footer link). One social-proof block (library) remains;
// privacy is reassured inline in the hero, on /how-it-works and in the footer,
// so the page stays ≤6 mobile screens.
export default async function Home() {
  await auth();

  return (
    <div className="soft-clarity-page" data-ui-version="design-v4-2-soft-clarity">
      <PublicJsonLd route="/" />
      <HomeAnalytics />
      <HeroSection />
      <ScenariosSection />
      <HowItWorksSection />
      <LibraryPreviewSection />
      <CTASection />
      <HomeAuthorityArticle />
    </div>
  );
}
