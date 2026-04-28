import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";

export const metadata = createPublicPageMetadata("/how-to-choose");

export default function HowToChoosePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <PublicJsonLd route="/how-to-choose" />
      {/* Hero */}
      <div className="mb-14 text-center">
        <span className="inline-block text-5xl mb-6">🔮</span>
        <h1 className="font-heading text-4xl font-bold">Как выбрать практика</h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
          Коротко о том, как найти хорошего специалиста и не ошибиться с выбором.
        </p>
      </div>

      <div className="space-y-14">
        {/* Шаг 1 */}
        <section>
          <div className="flex items-center gap-3 mb-5">
            <div className="h-9 w-9 rounded-full bg-primary/20 text-primary flex items-center justify-center font-heading font-bold text-lg shrink-0">1</div>
            <h2 className="font-heading text-xl font-semibold">Определитесь с целью</h2>
          </div>
          <div className="space-y-3 text-muted-foreground pl-12">
            <p>Разные специализации подходят для разных запросов:</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { spec: "Таро", emoji: "🃏", uses: "Ситуативные вопросы, отношения, выбор между вариантами" },
                { spec: "Астрология", emoji: "⭐", uses: "Натальная карта, период в жизни, совместимость" },
                { spec: "Нумерология", emoji: "🔢", uses: "Анализ имени, даты рождения, жизненного пути" },
                { spec: "Руны", emoji: "ᚱ", uses: "Оракульные вопросы, ответ «да/нет», направление" },
              ].map(item => (
                <div key={item.spec} className="rounded-xl border border-border/30 bg-card/20 p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-lg">{item.emoji}</span>
                    <span className="font-semibold text-sm">{item.spec}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.uses}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Шаг 2 */}
        <section>
          <div className="flex items-center gap-3 mb-5">
            <div className="h-9 w-9 rounded-full bg-primary/20 text-primary flex items-center justify-center font-heading font-bold text-lg shrink-0">2</div>
            <h2 className="font-heading text-xl font-semibold">Читайте профиль внимательно</h2>
          </div>
          <div className="space-y-3 text-muted-foreground pl-12">
            <p>Хороший профиль содержит:</p>
            <ul className="space-y-2">
              {[
                "Конкретное описание методов работы — не «помогу со всем», а что именно и как",
                "Реальные отзывы с деталями, не только «всё отлично»",
                "Честное указание опыта работы",
                "Фото — не аватар со стоков",
                "Внятную ценовую политику",
              ].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-primary mt-0.5 shrink-0">✓</span>
                  <span className="text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Шаг 3 */}
        <section>
          <div className="flex items-center gap-3 mb-5">
            <div className="h-9 w-9 rounded-full bg-primary/20 text-primary flex items-center justify-center font-heading font-bold text-lg shrink-0">3</div>
            <h2 className="font-heading text-xl font-semibold">Красные флаги — откажитесь сразу</h2>
          </div>
          <div className="pl-12 space-y-2">
            {[
              { flag: "Угрозы и порчи", desc: "«На вас порча, нужно срочно убрать за деньги» — это манипуляция, не практика" },
              { flag: "Гарантии результата", desc: "Ни один честный практик не гарантирует «любовь вернётся» или «бизнес пойдёт»" },
              { flag: "Срочность", desc: "«Только сейчас, потом будет хуже» — давление для принятия решения без раздумий" },
              { flag: "Запрос личных данных", desc: "Имя, дата рождения — норма. Пароли, данные карт, СНИЛС — никогда" },
              { flag: "Требование оплаты вне платформы", desc: "Все транзакции только через ETerapy. Оплата «в Telegram» не защищена" },
            ].map(item => (
              <div key={item.flag} className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-red-400 font-semibold text-sm">⚠ {item.flag}</span>
                </div>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Шаг 4 */}
        <section>
          <div className="flex items-center gap-3 mb-5">
            <div className="h-9 w-9 rounded-full bg-primary/20 text-primary flex items-center justify-center font-heading font-bold text-lg shrink-0">4</div>
            <h2 className="font-heading text-xl font-semibold">Начните с короткой сессии</h2>
          </div>
          <div className="pl-12 space-y-3 text-muted-foreground">
            <p>
              Первая сессия — это знакомство. Не нужно сразу брать 90 минут.
              15-30 минут достаточно чтобы понять совпадаете ли вы по стилю работы.
            </p>
            <p>
              После сессии оставьте отзыв — это помогает другим пользователям
              и мотивирует практиков работать качественно.
            </p>
          </div>
        </section>

        {/* Направления */}
        <section className="rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="font-heading text-lg font-semibold mb-3">💡 Сначала попробуйте направления самопознания</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Не уверены нужен ли вам практик? Начните с бесплатного вопроса:
            ETerapy уточнит контекст и предложит следующий шаг без давления.
          </p>
          <Link href="/all-modalities/checkin" className={cn(buttonVariants(), "text-sm")}>
            Задать вопрос →
          </Link>
        </section>

        {/* CTA */}
        <div className="text-center pt-4">
          <Link href="/all-modalities/checkin" className={cn(buttonVariants(), "px-8 py-3 text-base")}>
            Получить первичный ответ
          </Link>
        </div>
      </div>
    </div>
  );
}
