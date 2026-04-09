import Link from "next/link";
import { Separator } from "@/components/ui/separator";

export function Footer() {
  return (
    <footer className="border-t border-border/40 bg-navy">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <span className="font-heading text-lg font-bold text-primary">ETerapy</span>
            <p className="mt-2 text-sm text-muted-foreground">
              Люди, смыслы и технологии на стороне вашего внутреннего мира.
            </p>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-foreground">Клиентам</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/practitioners" className="hover:text-foreground">Каталог практиков</Link></li>
              <li><Link href="/modalities" className="hover:text-foreground">Направления</Link></li>
              <li><Link href="/how-to-choose" className="hover:text-foreground">Как выбрать практика</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-foreground">Практикам</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/practitioners/apply" className="hover:text-foreground">Стать практиком</Link></li>
              <li><Link href="/about#commission" className="hover:text-foreground">Условия и комиссия</Link></li>
              <li><Link href="/legal/ethics" className="hover:text-foreground">Этический кодекс</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-foreground">О проекте</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/about" className="hover:text-foreground">О нас</Link></li>
              <li><Link href="/legal/privacy" className="hover:text-foreground">Политика конфиденциальности</Link></li>
              <li><Link href="/legal/offer" className="hover:text-foreground">Оферта</Link></li>
            </ul>
          </div>
        </div>

        <Separator className="my-8 bg-border/40" />

        <div className="flex flex-col items-center justify-between gap-4 text-xs text-muted-foreground md:flex-row">
          <p>© {new Date().getFullYear()} ETerapy. Все права защищены.</p>
          <p className="max-w-xl text-center md:text-right">
            Все услуги носят развлекательный и ознакомительный характер. ETerapy не является
            медицинской, юридической или финансовой организацией.
          </p>
        </div>
      </div>
    </footer>
  );
}
