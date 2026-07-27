import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { HeroSection } from "@/components/landing/hero";
import { ScenariosSection } from "@/components/landing/scenarios";
import { HowItWorksSection } from "@/components/landing/how-it-works";
import { LibraryPreviewSection } from "@/components/landing/library-preview";
import { CTASection } from "@/components/landing/cta";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { HomeAnalytics } from "@/components/landing/home-analytics";
import { WebMcpRegistration } from "@/components/landing/webmcp-registration";

export const metadata = createPublicPageMetadata("/");

// B595 (владелец 2026-07-27): длинная SEO-статья («коротко и по существу» →
// «вывод и следующий шаг» + FAQ) снята с главной и переехала на
// /how-it-works — со своей разметкой Article и FAQPage. На главной она стоила
// шести экранов прокрутки между входом в воронку и подвалом, а разметка
// FAQPage на странице, чей основной контент — не FAQ, противоречит сама себе.
// Удалять было нельзя: это единственный длинный материал сайта и его цитаты.
//
// B374: lean, dialogue-first landing (≤6 mobile screens). The hero question
// entry is the single funnel entry; three scenario-routers sit below for people
// not ready to type. The 21-card service «простыня», esoteric service chips, the
// standalone growth widget, the B2B practitioners block, the specialists teaser
// and the duplicate "помогаем/не обещаем" panel were removed from the landing —
// services live in /products (5 groups), specialists on /practitioners, B2B on
// /practitioners/apply (footer link). One social-proof block (library) remains;
// privacy is reassured inline in the hero, on /how-it-works and in the footer,
// so the page stays ≤6 mobile screens.
// INC-080: здесь стоял `await auth()` без присваивания — остаток U04, где
// залогиненных уводили с лендинга редиректом. Редирект убрали, вызов остался, и
// он в одиночку держал ГЛАВНУЮ в динамическом рендере: результат никуда не шёл,
// а чтение кук делало страницу несобираемой заранее.
export default function Home() {
  return (
    <div className="soft-clarity-page" data-ui-version="design-v4-2-soft-clarity">
      <PublicJsonLd route="/" />
      <HomeAnalytics />
      <WebMcpRegistration />
      <HeroSection />
      <ScenariosSection />
      <HowItWorksSection />
      <LibraryPreviewSection />
      <CTASection />
    </div>
  );
}
