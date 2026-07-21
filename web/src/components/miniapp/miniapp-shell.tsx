"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  ArrowRight,
  ChatCircle,
  ChatCircleText,
  CheckCircle,
  Coins,
  CreditCard,
  CrownSimple,
  House,
  Lifebuoy,
  Notebook,
  Plus,
  Question,
  ShareNetwork,
  ShieldCheck,
  StarFour,
  User,
  X,
} from "@phosphor-icons/react";
import { track } from "@/lib/analytics";
import { formatPoints } from "@/lib/points";
import { MINIAPP_FEATURES, miniAppFeatureForPath } from "@/lib/miniapp/registry";
import type { MiniAppInitialData, MiniAppService } from "@/lib/miniapp/types";
import { MiniAppTelegramBootstrap } from "@/components/miniapp/telegram-bootstrap";
import { miniAppClass as c, styles } from "@/components/miniapp/styles";

// Контекст живёт в отдельном модуле без CSS — см. `miniapp-context.ts`.
// Ре-экспорт сохранён, чтобы не переписывать десятки существующих импортов.
import { MiniAppV21Context, useMiniAppV21, type MiniAppContextValue, type Utility } from "@/components/miniapp/miniapp-context";

export { useMiniAppV21, useMiniAppV21Optional } from "@/components/miniapp/miniapp-context";
export type { MiniAppContextValue } from "@/components/miniapp/miniapp-context";

const NAV_ICONS = {
  home: House,
  dialogues: ChatCircle,
  services: StarFour,
  diary: Notebook,
  profile: User,
};

function TopBar({ data, onUtility }: {
  data: MiniAppInitialData;
  onUtility: (utility: Exclude<Utility, null>) => void;
}) {
  return (
    <header className={styles.topbar}>
      <Link className={styles.wordmark} href="/miniapp" aria-label="ETerapy, на Главную">ETerapy</Link>
      <div className={styles["topbar-utilities"]} aria-label="Баланс, подписка и помощь">
        {/* INC-068: «баллов» было зашито строкой — на 9662 выходило
            «9662 баллов» вместо «9662 балла». Склонение считает `pointsWord`. */}
        <button className={styles["points-button"]} type="button" aria-label={`Баланс: ${formatPoints(data.viewer.points)}. Открыть`} onClick={() => onUtility("balance")}>
          <span className={c("utility-face", "points-face")}>
            <Coins size={14} weight="duotone" />
            <strong>{data.viewer.points}</strong>
            <span className={styles["utility-plus"]}><Plus size={9} weight="bold" /></span>
          </span>
        </button>
        {/* B554 (owner п.8): корона выглядела одинаково с подпиской и без.
            Активная подписка теперь заливает знак фирменным цветом, а точка
            остаётся индикатором «подписки нет». */}
        <button className={c("utility-button", "subscription-button", data.viewer.plan !== "Базовый" && "is-subscribed")} type="button" aria-label={`Подписка: ${data.viewer.plan}`} onClick={() => onUtility("subscription")}>
          <span className={styles["utility-face"]}><CrownSimple size={17} weight={data.viewer.plan === "Базовый" ? "duotone" : "fill"} /></span>
          {data.viewer.plan === "Базовый" ? <span className={styles["utility-status-dot"]} aria-hidden="true" /> : null}
        </button>
        <button className={styles["utility-button"]} type="button" aria-label="Помощь" onClick={() => onUtility("help")}>
          <span className={styles["utility-face"]}><Question size={16} weight="bold" /></span>
        </button>
      </div>
    </header>
  );
}

function BottomNav() {
  const pathname = usePathname();
  const active = miniAppFeatureForPath(pathname).id;
  const { data } = useMiniAppV21();

  return (
    <nav className={styles["bottom-nav"]} aria-label="Основная навигация">
      {MINIAPP_FEATURES.map((feature) => {
        const Icon = NAV_ICONS[feature.id];
        const current = active === feature.id;
        if (feature.central) {
          return (
            <Link key={feature.id} href={feature.route} aria-current={current ? "page" : undefined} className={c("nav-item", "nav-services", current && "is-active")}>
              <span className={styles["services-orb"]}><Icon size={30} /></span>
              <span>{feature.label}</span>
            </Link>
          );
        }
        return (
          <Link key={feature.id} href={feature.route} aria-current={current ? "page" : undefined} className={c("nav-item", current && "is-active")}>
            <span className={c("nav-icon-wrap", feature.id === "profile" && data.profileNotice && "has-notice")}>
              <Icon size={feature.id === "profile" ? 24 : 22} weight={current ? "fill" : "regular"} />
              {feature.id === "profile" && data.profileNotice ? <span className="sr-only">Есть новые события</span> : null}
            </span>
            <span>{feature.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

const UTILITY_CONTENT = {
  balance: {
    label: "Баланс баллов",
    eyebrow: "ваш баланс",
    lead: "Используйте баллы для цифровых разборов и диалога в чате.",
    actions: [
      { href: "/miniapp/profile/wallet", Icon: Coins, title: "Баланс и пакеты", text: "Начисления и варианты пополнения" },
      { href: "/miniapp/services", Icon: StarFour, title: "На что потратить", text: "Услуги с ценой в баллах" },
    ],
  },
  subscription: {
    label: "Подписка",
    eyebrow: "подписка",
    lead: "Сравните возможности спокойно, без автоматической покупки.",
    actions: [
      { href: "/miniapp/packages", Icon: CrownSimple, title: "Посмотреть варианты", text: "Тарифы и пакеты в одном месте" },
      { href: "/miniapp/profile/subscription", Icon: CheckCircle, title: "Что доступно сейчас", text: "Текущий план и период" },
    ],
  },
  help: {
    label: "Помощь",
    eyebrow: "помощь",
    lead: "Короткие ответы и поддержка, если вопрос требует человека.",
    actions: [
      { href: "/miniapp/help", Icon: Question, title: "Как всё работает", text: "Разборы, приватность и Дневник" },
      { href: "/miniapp/help#payments", Icon: CreditCard, title: "Оплата и возвраты", text: "Условия до подтверждения покупки" },
      { href: "/miniapp/help#support", Icon: Lifebuoy, title: "Написать в поддержку", text: "Диалог с командой ETerapy" },
    ],
  },
} as const;

function Sheet({ open, onOpenChange, title, eyebrow, lead, children, label }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  eyebrow: string;
  lead: string;
  children: ReactNode;
  label: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className={styles["overlay-scrim"]} />
        <DialogPrimitive.Popup className={c("bottom-sheet", "utility-sheet")} aria-label={label}>
          <div className={styles["sheet-handle"]} aria-hidden="true" />
          <header className={styles["sheet-header"]}>
            <div>
              <p className={styles.eyebrow}>{eyebrow}</p>
              <DialogPrimitive.Title className={styles["sheet-title"]}>{title}</DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close className={styles["sheet-close"]} aria-label="Закрыть"><X size={18} weight="bold" /></DialogPrimitive.Close>
          </header>
          <DialogPrimitive.Description className={styles["sheet-lead"]}>{lead}</DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function UtilitySheet({ utility, data, onClose }: { utility: Utility; data: MiniAppInitialData; onClose: () => void }) {
  const content = utility ? UTILITY_CONTENT[utility] : null;
  if (!content) return null;
  const title = utility === "balance" ? formatPoints(data.viewer.points) : utility === "subscription" ? data.viewer.plan : "Чем помочь?";

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }} title={title} eyebrow={content.eyebrow} lead={content.lead} label={content.label}>
      <div className={c("share-options", "utility-options")}>
        {content.actions.map(({ href, Icon, title: actionTitle, text }) => (
          <Link key={href} href={href} onClick={onClose}>
            <span><Icon size={20} /></span>
            <span><strong>{actionTitle}</strong><small>{text}</small></span>
            <ArrowRight size={18} />
          </Link>
        ))}
      </div>
      {utility === "help" ? <p className={styles["utility-response-note"]}><ChatCircleText size={16} /> Обычно отвечаем в течение дня</p> : null}
    </Sheet>
  );
}

function ServiceSheet({ service, onClose, onShare }: {
  service: MiniAppService | null;
  onClose: () => void;
  onShare: (title: string, url: string) => Promise<void>;
}) {
  if (!service) return null;
  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }} title={service.title} eyebrow={service.eyebrow} lead={service.description} label={service.title}>
      <div className={styles["sheet-price-row"]}><strong>{service.price}</strong><span>{service.priceMeta}</span></div>
      {service.freeNote ? <p className={styles["sheet-free-note"]}>{service.freeNote}</p> : null}
      <p className={styles["privacy-note"]}><ShieldCheck size={17} /> {service.privacy}</p>
      <div className={styles["sheet-actions"]}>
        <Link href={service.href} onClick={() => { onClose(); track({ event: "miniapp_service_cta", surface: "miniapp", properties: { service: service.id } }); }} className={c("primary-action", "compact")}>
          {service.cta} <ArrowRight size={18} />
        </Link>
        {service.shareable ? <button type="button" className={styles["secondary-action"]} onClick={() => onShare(service.title, service.href)}><ShareNetwork size={18} /> Пригласить по ссылке</button> : null}
      </div>
    </Sheet>
  );
}

export function MiniAppChrome({ data, children }: { data: MiniAppInitialData; children: ReactNode }) {
  const { openUtility } = useMiniAppV21();
  const pathname = usePathname();
  const topLevel = ["/miniapp", "/miniapp/dialogues", "/miniapp/services", "/miniapp/diary", "/miniapp/profile"].includes(pathname);
  return (
    <div className={c("screen-scroll", !topLevel && "is-subpage")}>
      {topLevel ? <TopBar data={data} onUtility={openUtility} /> : null}
      {children}
    </div>
  );
}

export function MiniAppShell({ data, children }: { data: MiniAppInitialData; children: ReactNode }) {
  const [utility, setUtility] = useState<Utility>(null);
  const [service, setService] = useState<MiniAppService | null>(null);
  const [notice, setNotice] = useState("");
  const [telegramName, setTelegramName] = useState("");
  const pathname = usePathname();
  const inLiveSession = pathname.startsWith("/miniapp/session/");

  useEffect(() => {
    track({ event: "miniapp_view", surface: "miniapp", properties: { view: miniAppFeatureForPath(pathname).id } });
  }, [pathname]);

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  };

  const share = async (title: string, url: string) => {
    const absolute = new URL(url, window.location.origin).toString();
    try {
      if (navigator.share) await navigator.share({ title, url: absolute });
      else {
        await navigator.clipboard.writeText(absolute);
        notify("Ссылка скопирована");
      }
      track({ event: "miniapp_share", surface: "miniapp", properties: { kind: url.includes("practitioner") ? "practitioner" : "service" } });
    } catch {
      // Native share was cancelled by the user.
    }
  };

  const value: MiniAppContextValue = {
    data,
    viewerName: telegramName || data.viewer.firstName,
    openService: setService,
    openUtility: setUtility,
    notify,
    share,
  };

  return (
    <MiniAppV21Context.Provider value={value}>
      <MiniAppTelegramBootstrap authenticated={data.viewer.authenticated} onGuestName={setTelegramName} />
      <main className={styles.stage} data-testid="miniapp-shell">
        <section className={styles.app} aria-label="ETerapy Mini App">
          {data.loadError ? <div className={styles["inline-error"]} role="status">Личные данные временно не загрузились. Основные разделы доступны.</div> : null}
          {children}
          {/* B554: во время живой видеосессии таббар висел поверх нижней части
              звонка — один промах по «Дневнику» молча выкидывал клиента из
              сессии. На этом маршруте навигация скрыта. */}
          {inLiveSession ? null : <BottomNav />}
          <div className={c("toast", notice && "is-visible")} role="status" aria-live="polite">{notice}</div>
        </section>
      </main>
      <UtilitySheet utility={utility} data={data} onClose={() => setUtility(null)} />
      <ServiceSheet service={service} onClose={() => setService(null)} onShare={share} />
    </MiniAppV21Context.Provider>
  );
}
