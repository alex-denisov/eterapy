import { CalendarDays, Hash, Sparkles } from "lucide-react";
import { EsotericServicePage } from "@/components/public/esoteric-soon-page";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";

export const metadata = createPublicPageMetadata("/numerology");

export default function NumerologyPage() {
  return (
    <>
      <PublicJsonLd route="/numerology" />
      <EsotericServicePage
        eyebrow="новое направление · Нумерология"
        title={
          <>
            Числовой <span className="soft-italic">портрет</span> и циклы
          </>
        }
        subtitle="Числа — короткий язык, на котором удобно разговаривать о повторяющихся темах и поворотных годах. ETerapy подаёт нумерологию как карту вопросов, а не приговор."
        quote="Число — это не вы. Это форма, в которой удобно увидеть один из ваших ритмов."
        glyph={Hash}
        accent="var(--soft-bordeaux)"
        paper="linear-gradient(160deg, #f4d9c1, #fff3e7)"
        products={[
          { title: "Числовой портрет", description: "Числа имени и даты — темы и сильные стороны.", price: "390 ₽", icon: Sparkles },
          { title: "Личный год", description: "В каком цикле вы сейчас и что в нём важно.", price: "490 ₽", icon: CalendarDays },
          { title: "Совместимость по числам", description: "Парный разбор по приглашению.", price: "590 ₽", icon: Hash },
        ]}
      />
    </>
  );
}
