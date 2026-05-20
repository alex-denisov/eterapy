import { CalendarDays, Compass, Sparkles } from "lucide-react";
import { EsotericServicePage } from "@/components/public/esoteric-soon-page";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";

export const metadata = createPublicPageMetadata("/astro");

export default function AstroPage() {
  return (
    <>
      <PublicJsonLd route="/astro" />
      <EsotericServicePage
        eyebrow="новое направление · Астрология"
        title={
          <>
            Натальная карта как <span className="soft-italic">портрет</span>, а не сценарий
          </>
        }
        subtitle="Астрологический разбор — символический язык про темы и фокусы. В ETerapy это не «вы такой(ая) и навсегда», а приглашение посмотреть на знакомое с другой стороны."
        quote="Звёзды не решают за вас. Они подсвечивают то, что вы уже узнаёте в себе."
        glyph={Compass}
        accent="#3a4a36"
        paper="linear-gradient(160deg, #d6decc, #eff2e8)"
        products={[
          { title: "Натальная карта", description: "Базовый разбор с акцентом на ваши вопросы.", price: "590 ₽", icon: Sparkles },
          { title: "Транзиты года", description: "Темы и фокусы на ближайшие 12 месяцев.", price: "890 ₽", icon: CalendarDays },
          { title: "Синастрия пары", description: "Совместимость в символическом ключе.", price: "990 ₽", icon: Compass },
        ]}
      />
    </>
  );
}
