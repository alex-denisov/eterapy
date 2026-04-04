import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

export const metadata = { title: "Как выбрать практика — ETerapy" };

export default function HowToChoosePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-heading text-3xl font-bold">Как выбрать практика</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        Несколько вопросов, которые помогут сориентироваться.
      </p>

      <div className="mt-10 space-y-10">

        <section>
          <h2 className="font-heading text-xl font-semibold">1. Определитесь с запросом</h2>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            Разные специалисты работают с разными запросами. Прежде чем искать — 
            ответьте себе на вопрос: что именно вы хотите получить от сессии?
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              { icon: "🃏", specialty: "Таролог", best: "Конкретный вопрос, ситуация выбора, отношения" },
              { icon: "⭐", specialty: "Астролог", best: "Понять себя глубже, прогноз, натальная карта" },
              { icon: "🔢", specialty: "Нумеролог", best: "Жизненный путь, имя, дата события" },
              { icon: "💫", specialty: "Руны / Ясновидение", best: "Интуитивный взгляд на ситуацию" },
            ].map((item) => (
              <div key={item.specialty} className="rounded-xl border border-border/40 bg-card/30 p-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{item.icon}</span>
                  <span className="font-medium">{item.specialty}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{item.best}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold">2. Читайте отзывы, а не только рейтинг</h2>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            Высокий рейтинг — хороший сигнал. Но важнее — содержание отзывов.
            Обращайте внимание на то, <em>как</em> описывают сессию: была ли конкретика,
            ощущалось ли давление, соответствовал ли результат ожиданиям.
          </p>
          <div className="mt-4 rounded-xl border border-green-500/20 bg-green-500/5 p-4">
            <p className="text-sm font-medium text-green-400">✓ Хорошие сигналы в отзывах</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>«Конкретные ответы без воды»</li>
              <li>«Не давил, не запугивал»</li>
              <li>«Попал в ситуацию точно»</li>
              <li>«Дал практичные советы»</li>
            </ul>
          </div>
          <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
            <p className="text-sm font-medium text-rose-400">✗ Настораживающие сигналы</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>«Сказал что на мне порча»</li>
              <li>«Предложил дополнительные платные ритуалы»</li>
              <li>«Говорил очень общими фразами»</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold">3. Смотрите на опыт и количество сессий</h2>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            Новые практики с небольшим числом сессий могут быть не хуже опытных — 
            но у них меньше публичной репутации. Если важна уверенность — 
            выбирайте тех, у кого 50+ сессий и стабильный рейтинг.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold">4. Цена не равна качеству</h2>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            Дорогой практик — не обязательно лучший. Ориентируйтесь на отзывы
            и специализацию. Диапазон цен на платформе — от 1 800 до 5 000 ₽ за сессию.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold">5. Помните об ограничениях</h2>
          <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground leading-relaxed">
            Все услуги на ETerapy носят <strong className="text-foreground">развлекательный и ознакомительный характер</strong>.
            Консультация практика не заменяет помощь врача, психолога или юриста.
            Если вы переживаете острый кризис — обратитесь к профессионалам.
          </div>
        </section>

        <div className="flex flex-wrap gap-3 border-t border-border/30 pt-6">
          <Link href="/practitioners" className={cn(buttonVariants())}>
            Перейти к каталогу
          </Link>
          <Link href="/tools" className={cn(buttonVariants({ variant: "outline" }), "border-border/40 text-muted-foreground")}>
            Попробовать инструменты
          </Link>
        </div>
      </div>
    </div>
  );
}
