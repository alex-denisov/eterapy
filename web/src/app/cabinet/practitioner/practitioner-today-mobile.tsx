import Link from "next/link";
import { ChevronRight, Inbox, Lock, ShieldAlert, Sparkles, Video } from "lucide-react";
import { PractitionerAppbar } from "@/components/cabinet/practitioner-appbar";

// B466 R9-4 P1 — экран «Сегодня» мобильного кокпита практика, разметка 1-в-1
// по docs/Design/mockups/practitioner-cabinet-today.html: appbar → приветствие
// → hero «Следующая сессия» → «Требует внимания» → расписание дня → метрики.
// Ниже макетных блоков — owner-дополнения round-8: CTA тарифа и квота
// «Разборы и AI». Компонент презентационный: все строки готовит page.tsx
// (серверные data-loaders переиспользуются, разметка — новая).

export interface TodayMobileAppbar {
  initials: string;
  name: string;
  tierLabel: string;
  subtitle: string | null;
}

export interface TodayMobileHero {
  startsIn: string;
  clientInitials: string;
  clientName: string;
  modalityLine: string;
  timeRange: string;
  canJoin: boolean;
  joinHref: string;
  cardHref: string;
}

export interface TodayMobileAttentionRow {
  key: string;
  href: string;
  tone: "warm" | "amber" | "calm";
  icon: "inbox" | "spark" | "shield";
  title: string;
  badge?: string;
  subtitle: string;
}

export interface TodayMobileScheduleRow {
  id: string;
  time: string;
  title: string;
  subtitle: string;
  tag: { label: string; kind: "next" | "ok" | "live" };
}

export interface TodayMobileStat {
  key: string;
  href: string;
  value: string;
  unit?: string;
  label: string;
}

export interface TodayMobileCta {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  button: string;
}

export interface TodayMobileQuota {
  used: number;
  included: number;
  pct: number;
  remaining: number;
  resetLabel: string;
  manageHref: string;
}

// Четырёхлучевая звезда AI-строки — точный glyph макета (в lucide нет 1-в-1).
function SparkGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <path d="M12 2.6l1.9 5.1 5.1 1.9-5.1 1.9L12 16.6l-1.9-5.1L5 9.6l5.1-1.9z" />
    </svg>
  );
}

const ATTENTION_ICONS = {
  inbox: <Inbox className="h-[18px] w-[18px]" aria-hidden="true" />,
  spark: <SparkGlyph />,
  shield: <ShieldAlert className="h-[18px] w-[18px]" aria-hidden="true" />,
} as const;

export function PractitionerTodayMobile({
  appbar,
  dateLabel,
  greeting,
  statusNote,
  hero,
  availabilityHref,
  attention,
  scheduleCountLabel,
  calendarHref,
  schedule,
  stats,
  cta,
  quota,
}: {
  appbar: TodayMobileAppbar;
  dateLabel: string;
  greeting: string;
  statusNote?: string;
  hero: TodayMobileHero | null;
  availabilityHref: string;
  attention: TodayMobileAttentionRow[];
  scheduleCountLabel: string;
  calendarHref: string;
  schedule: TodayMobileScheduleRow[];
  stats: TodayMobileStat[];
  cta: TodayMobileCta | null;
  quota: TodayMobileQuota;
}) {
  return (
    <div className="pcab-screen md:hidden" data-pcab-top data-testid="practitioner-today-mobile">
      <PractitionerAppbar
        initials={appbar.initials}
        name={appbar.name}
        tierLabel={appbar.tierLabel}
        subtitle={appbar.subtitle}
      />

      {/* greeting */}
      <div style={{ marginTop: 16 }}>
        <div className="pcab-eyebrow">{dateLabel}</div>
        <h1 className="pcab-greeting">{greeting}</h1>
        {statusNote && (
          <p className="mt-1.5 text-[13px] font-medium" style={{ color: "var(--pc-bordeaux)" }}>
            {statusNote}
          </p>
        )}
      </div>

      {/* next session hero */}
      <div className="pcab-section">
        {hero ? (
          <div className="pcab-hero" data-testid="pcab-next-session">
            <div className="pcab-hero-top">
              <span className="pcab-hero-eyebrow">Следующая сессия</span>
              <span className="pcab-pill-soon">{hero.startsIn}</span>
            </div>
            <div className="pcab-hero-client">
              <div className="pcab-avatar-sm" aria-hidden="true">{hero.clientInitials}</div>
              <div style={{ minWidth: 0 }}>
                <div className="pcab-hero-name">{hero.clientName}</div>
                <div className="pcab-hero-modality">{hero.modalityLine}</div>
              </div>
            </div>
            <div className="pcab-hero-meta">
              <div className="pcab-hero-time">{hero.timeRange}</div>
              <span className="pcab-rec-line">
                <Lock className="h-3 w-3" aria-hidden="true" />
                запись включена
              </span>
            </div>
            <div className="pcab-hero-actions">
              {hero.canJoin ? (
                <a href={hero.joinHref} className="pcab-btn pcab-btn-primary" data-testid="pcab-join-session">
                  <Video className="h-[17px] w-[17px]" aria-hidden="true" />
                  Войти в сессию
                </a>
              ) : (
                <span
                  className="pcab-btn pcab-btn-primary flex-1"
                  aria-disabled="true"
                  data-testid="pcab-join-gated"
                  title="«Войти» откроется за 30 минут до начала"
                >
                  Войти — за 30 мин до начала
                </span>
              )}
              <Link href={hero.cardHref} className="pcab-btn pcab-btn-ghost">
                Карточка
              </Link>
            </div>
          </div>
        ) : (
          <div className="pcab-hero" data-testid="pcab-next-session-empty">
            <span className="pcab-hero-eyebrow">Следующая сессия</span>
            <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--pc-ink-soft)" }}>
              Подтверждённых сессий впереди нет. Проверьте доступность в календаре — клиенты записываются только в открытые часы.
            </p>
            <div className="pcab-hero-actions">
              <Link href={availabilityHref} className="pcab-btn pcab-btn-ghost">
                Открыть доступность
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* attention */}
      {attention.length > 0 && (
        <div className="pcab-section" data-testid="pcab-attention">
          <div className="pcab-section-head">
            <span className="pcab-eyebrow">Требует внимания</span>
          </div>
          <div className="pcab-list">
            {attention.map((row) => (
              <Link key={row.key} href={row.href} className="pcab-row">
                <span className={`pcab-row-ic ${row.tone}`}>{ATTENTION_ICONS[row.icon]}</span>
                <span className="pcab-row-main">
                  <span className="pcab-row-t">
                    {row.title}
                    {row.badge && <span className="pcab-row-badge">{row.badge}</span>}
                  </span>
                  <span className="pcab-row-s">{row.subtitle}</span>
                </span>
                <ChevronRight className="pcab-chev h-[18px] w-[18px]" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* today's schedule */}
      <div className="pcab-section" data-testid="pcab-schedule">
        <div className="pcab-section-head">
          <span className="pcab-eyebrow">{scheduleCountLabel}</span>
          <Link href={calendarHref} className="pcab-link">
            весь день →
          </Link>
        </div>
        <div className="pcab-list">
          {schedule.length === 0 ? (
            <div className="pcab-row">
              <span className="pcab-row-s">На сегодня сессий нет</span>
            </div>
          ) : (
            schedule.map((row) => (
              <div key={row.id} className="pcab-tl-row">
                <div className="pcab-tl-time">{row.time}</div>
                <div className="pcab-tl-main">
                  <div className="pcab-tl-t">{row.title}</div>
                  <div className="pcab-tl-s">{row.subtitle}</div>
                </div>
                <span className={`pcab-tag ${row.tag.kind}`}>{row.tag.label}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* stats — карточки-ссылки (owner round-8 #3) */}
      <div className="pcab-section">
        <div className="pcab-stats" data-testid="pcab-stats">
          {stats.map((stat) => (
            <Link key={stat.key} href={stat.href} className="pcab-stat">
              <div className="pcab-stat-v">
                {stat.value}
                {stat.unit && <small> {stat.unit}</small>}
              </div>
              <div className="pcab-stat-k">{stat.label}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Owner round-8 дополнения ниже макетных блоков: CTA тарифа (r8 #2,
          контраст по R9-1 — явные цвета поверх бордо) и квота AI (B434). */}
      {cta && (
        <div className="pcab-section">
          <Link
            href={cta.href}
            data-testid="pcab-subscription-cta"
            className="block overflow-hidden rounded-[18px] p-4"
            style={{ background: "var(--pc-bordeaux)", color: "var(--pc-cream)" }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "#E9C9B6" }}>
                {cta.eyebrow}
              </p>
              <Sparkles className="h-4 w-4" style={{ color: "#E9C9B6" }} aria-hidden="true" />
            </div>
            <p className="mt-2 font-heading text-[17px] font-semibold leading-snug" style={{ color: "var(--pc-cream)" }}>
              {cta.title}
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "rgba(251,241,228,0.82)" }}>
              {cta.body}
            </p>
            <span
              className="mt-3.5 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold"
              style={{ background: "var(--pc-cream)", color: "var(--pc-bordeaux)" }}
            >
              {cta.button}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </Link>
        </div>
      )}

      <div className="pcab-section">
        <div className="pcab-card" data-testid="pcab-ai-quota">
          <span className="pcab-eyebrow">Разборы и AI</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="pcab-stat-v" style={{ fontSize: 22, color: "var(--pc-bordeaux)" }}>
              {quota.used}
            </span>
            <span className="text-[13px]" style={{ color: "var(--pc-ink-soft)" }}>
              из {quota.included} в этом месяце
            </span>
          </div>
          <div className="pcab-progress mt-2.5">
            <span style={{ width: `${quota.pct}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[11.5px]" style={{ color: "var(--pc-ink-faint)" }}>
              Осталось {quota.remaining} · обновится {quota.resetLabel}
            </p>
            <Link
              href={quota.manageHref}
              className="shrink-0 text-xs font-medium"
              style={{ color: "var(--pc-terracotta-dark)" }}
            >
              Управлять →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
