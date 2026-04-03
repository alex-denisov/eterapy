import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

export const metadata = { title: "О проекте — ETerapy" };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-heading text-3xl font-bold">О проекте ETerapy</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        Этичная эзотерическая платформа. Люди, смыслы и технологии на стороне
        вашего внутреннего мира.
      </p>

      <div className="mt-10 space-y-8">
        <section>
          <h2 className="font-heading text-xl font-semibold">Зачем мы существуем</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Рынок эзотерических услуг в России и СНГ не имеет ни стандартов,
            ни защиты покупателя. Люди платят в Telegram без чека, сталкиваются
            с запугиванием и манипуляциями, не могут проверить кто им пишет.
          </p>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            ETerapy создана чтобы изменить это. Мы не пытаемся «легитимизировать»
            эзотерику — мы строим безопасную среду, где люди могут обращаться к
            практикам без риска. Честно, прозрачно, с защитой денег.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold">Наши принципы</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {[
              { icon: "⚖️", title: "Честность", text: "Фиксированная цена, прозрачная комиссия 25%, никаких скрытых платежей." },
              { icon: "🛡️", title: "Безопасность", text: "Деньги удерживаются до сессии. Возврат при нарушениях." },
              { icon: "✦", title: "Верификация", text: "Проверяем личность и этику — но честно говорим, что не можем проверить «способности»." },
              { icon: "🌍", title: "Доступность", text: "Международные платежи, доступ из любой точки мира." },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-border/40 bg-card/30 p-4">
                <span className="text-2xl">{item.icon}</span>
                <h3 className="mt-2 font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold">Команда</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {[
              { name: "Алексей Денисов", role: "CEO · Product · Frontend", emoji: "🚀" },
              { name: "Иван Гаранин", role: "CTO · Backend · Платежи", emoji: "⚙️" },
            ].map((member) => (
              <div key={member.name} className="flex items-center gap-4 rounded-xl border border-border/40 bg-card/30 p-4">
                <span className="text-3xl">{member.emoji}</span>
                <div>
                  <p className="font-semibold">{member.name}</p>
                  <p className="text-sm text-muted-foreground">{member.role}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold">Контакты</h2>
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            <p>📧 Общие вопросы: <a href="mailto:hello@eterapy.com" className="text-primary hover:underline">hello@eterapy.com</a></p>
            <p>🛡️ Этика и жалобы: <a href="mailto:ethics@eterapy.com" className="text-primary hover:underline">ethics@eterapy.com</a></p>
            <p>🔒 Персональные данные: <a href="mailto:privacy@eterapy.com" className="text-primary hover:underline">privacy@eterapy.com</a></p>
          </div>
        </section>

        <div className="flex flex-wrap gap-3 border-t border-border/30 pt-6">
          <Link href="/legal/offer" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "border-border/40 text-muted-foreground")}>
            Оферта
          </Link>
          <Link href="/legal/privacy" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "border-border/40 text-muted-foreground")}>
            Политика конфиденциальности
          </Link>
          <Link href="/legal/ethics" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "border-border/40 text-muted-foreground")}>
            Этический кодекс
          </Link>
        </div>
      </div>
    </div>
  );
}
