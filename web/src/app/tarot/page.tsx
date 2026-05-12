import { CalendarDays, Moon, Sparkles } from "lucide-react";
import { EsotericSoonPage } from "@/components/public/esoteric-soon-page";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";

export const metadata = createPublicPageMetadata("/tarot");

export default function TarotPage() {
  return (
    <>
      <PublicJsonLd route="/tarot" />
      <EsotericSoonPage
        eyebrow="новое направление · Таро"
        title={
          <>
            Расклад как <span className="soft-italic">зеркало</span>, а не оракул
          </>
        }
        subtitle="Таро в ETerapy — способ задать себе вопрос через образ. Мы делаем разбор бережно, без катастрофических трактовок и без обещаний будущего."
        quote="Карта — это не приговор. Это вопрос, на который вы пока не дали себе отвечать."
        glyph={Moon}
        accent="#4a3e5e"
        paper="linear-gradient(160deg, #dbd3ea, #eee6f5)"
        products={[
          { title: "Расклад «Развилка»", description: "Три карты для одного решения. С разбором и шагом.", price: "390 ₽", icon: Sparkles },
          { title: "Расклад «Год»", description: "Карты на 12 месяцев — как темы, не как факты.", price: "590 ₽", icon: CalendarDays },
          { title: "Тарологическая сессия", description: "45 минут с тарологом ETerapy.", price: "от 2 500 ₽", icon: Moon },
        ]}
      />
    </>
  );
}
