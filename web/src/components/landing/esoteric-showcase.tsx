import Link from "next/link";
import { Compass, Moon, Sparkles, Users } from "lucide-react";

const offers = [
  { href: "/products/tarot", icon: Moon, label: "Таро · 390 ₽" },
  { href: "/products/natal-chart", icon: Compass, label: "Натальная карта · 590 ₽" },
  { href: "/products/numerology", icon: Sparkles, label: "Числовой портрет · 390 ₽" },
  { href: "/products/joint-session", icon: Users, label: "Эзотерик + психотерапевт · от 4 500 ₽" },
];

export function EsotericShowcaseSection() {
  return (
    <section className="soft-shell py-16 md:py-24" data-testid="v42-esoteric-showcase">
      <div
        className="soft-card overflow-hidden p-0"
        style={{ background: "linear-gradient(135deg, #DBD3EA 0%, #F4D9C1 70%, #D6DECC 100%)" }}
      >
        <div className="grid gap-8 p-8 md:grid-cols-[1.2fr_1fr] md:items-center md:p-12">
          <div>
            <div className="soft-eyebrow" style={{ color: "#4A3E5E" }}>
              эзотерические направления
            </div>
            <h2 className="soft-h1 mt-3" style={{ color: "#3A2E58" }}>
              Таро, астрология, нумерология — <span className="soft-italic">как метафоры</span>, не как оракулы
            </h2>
            <p
              className="mt-4 max-w-lg text-base leading-relaxed"
              style={{ color: "#4A3E5E" }}
            >
              Символический язык, чтобы посмотреть на ситуацию иначе. Каждый формат
              поддержан этическим кодексом ETerapy — без предсказаний и
              катастрофических трактовок.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {offers.map((offer) => {
                const Icon = offer.icon;
                return (
                  <Link
                    key={offer.href}
                    href={offer.href}
                    className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/60 px-3 py-1.5 text-sm font-medium text-[#3A2E58] backdrop-blur transition-colors hover:bg-white/80"
                    data-testid={`v42-esoteric-chip-${offer.href.split("/").pop()}`}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                    {offer.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="relative hidden h-[220px] md:block" aria-hidden="true">
            <div
              className="absolute grid h-[130px] w-[80px] place-items-center rounded-md border-2 font-heading text-4xl italic shadow-[0_12px_24px_-8px_rgba(0,0,0,0.3)]"
              style={{
                left: 20,
                top: 20,
                background: "linear-gradient(140deg, #4A3E5E, #6B5C82)",
                borderColor: "#DBD3EA",
                color: "#DBD3EA",
                transform: "rotate(-8deg)",
              }}
            >
              ★
            </div>
            <div
              className="absolute grid h-[130px] w-[80px] place-items-center rounded-md border-2 font-heading text-4xl italic shadow-[0_12px_24px_-8px_rgba(0,0,0,0.3)]"
              style={{
                left: 100,
                top: 0,
                background: "linear-gradient(140deg, #4A3E5E, #6B5C82)",
                borderColor: "#DBD3EA",
                color: "#DBD3EA",
              }}
            >
              ☾
            </div>
            <div
              className="absolute grid h-[130px] w-[80px] place-items-center rounded-md border-2 font-heading text-4xl italic shadow-[0_12px_24px_-8px_rgba(0,0,0,0.3)]"
              style={{
                left: 180,
                top: 20,
                background: "linear-gradient(140deg, #4A3E5E, #6B5C82)",
                borderColor: "#DBD3EA",
                color: "#DBD3EA",
                transform: "rotate(8deg)",
              }}
            >
              9
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
