"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  ArrowRight, ChatCircle, CheckCircle, Coins, CreditCard, CrownSimple,
  House, Lifebuoy, Notebook, Plus, Question, ShareNetwork, ShieldCheck,
  StarFour, User, X,
} from "@phosphor-icons/react";
import { track } from "@/lib/analytics";
import { MINIAPP_FEATURES, miniAppFeatureForPath } from "@/lib/miniapp/registry";
import type { MiniAppInitialData, MiniAppService } from "@/lib/miniapp/types";
import styles from "@/app/miniapp/miniapp.module.css";

type Utility = "balance" | "subscription" | "help" | null;
type MiniAppContextValue = {
  data: MiniAppInitialData;
  openService: (service: MiniAppService) => void;
  openUtility: (utility: Exclude<Utility, null>) => void;
  notify: (message: string) => void;
  share: (title: string, url: string) => Promise<void>;
};

const MiniAppV21Context = createContext<MiniAppContextValue | null>(null);

export function useMiniAppV21(): MiniAppContextValue {
  const context = useContext(MiniAppV21Context);
  if (!context) throw new Error("useMiniAppV21 must be used inside MiniAppShell");
  return context;
}

const NAV_ICONS = { home: House, dialogues: ChatCircle, services: StarFour, diary: Notebook, profile: User };

function TopBar({ data, onUtility }: { data: MiniAppInitialData; onUtility: (utility: Exclude<Utility, null>) => void }) {
  return (
    <header className={styles.topbar}>
      <Link className={styles.wordmark} href="/miniapp" aria-label="ETerapy, на Главную">ETerapy</Link>
      <div className={styles.utilities} aria-label="Баланс, подписка и помощь">
        <button className={styles.pointsButton} type="button" aria-label={`Баланс: ${data.viewer.points} баллов`} onClick={() => onUtility("balance")}>
          <span className={styles.utilityFace}><Coins size={14} weight="duotone" /><strong>{data.viewer.points}</strong><span className={styles.utilityPlus}><Plus size={9} weight="bold" /></span></span>
        </button>
        <button className={styles.utilityButton} type="button" aria-label={`Подписка: ${data.viewer.plan}`} onClick={() => onUtility("subscription")}>
          <span className={styles.utilitySquare}><CrownSimple size={17} weight="duotone" /></span>
          {data.viewer.plan === "Базовый" ? <span className={styles.utilityDot} aria-hidden="true" /> : null}
        </button>
        <button className={styles.utilityButton} type="button" aria-label="Помощь" onClick={() => onUtility("help")}>
          <span className={styles.utilitySquare}><Question size={16} weight="bold" /></span>
        </button>
      </div>
    </header>
  );
}

function BottomNav() {
  const pathname = usePathname();
  const active = miniAppFeatureForPath(pathname).id;
  return (
    <nav className={styles.bottomNav} aria-label="Основная навигация">
      {MINIAPP_FEATURES.map((feature) => {
        const Icon = NAV_ICONS[feature.id];
        const current = active === feature.id;
        return (
          <Link key={feature.id} href={feature.route} aria-current={current ? "page" : undefined}
            className={`${styles.navItem} ${feature.central ? styles.navServices : ""} ${current ? styles.navActive : ""}`}>
            {feature.central ? <span className={styles.servicesOrb}><Icon size={30} /></span> : <span className={styles.navIcon}><Icon size={feature.id === "profile" ? 24 : 22} weight={current ? "fill" : "regular"} /></span>}
            <span>{feature.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

const UTILITY_CONTENT = {
  balance: {
    eyebrow: "ваш баланс", title: "Баллы ясности",
    lead: "Баллы используются для цифровых разборов и диалога в чате.",
    actions: [
      { href: "/cabinet/wallet", Icon: Coins, title: "Баланс и пополнение", text: "Текущие начисления и доступные способы" },
      { href: "/miniapp/services", Icon: StarFour, title: "На что потратить", text: "Услуги с ценой в баллах" },
    ],
  },
  subscription: {
    eyebrow: "подписка", title: "Текущий тариф",
    lead: "Сравните возможности спокойно, без автоматической покупки.",
    actions: [
      { href: "/pricing", Icon: CrownSimple, title: "Сравнить тарифы", text: "Plus, Premium и базовый доступ" },
      { href: "/cabinet/billing", Icon: CheckCircle, title: "Моя подписка", text: "Статус, период и управление" },
    ],
  },
  help: {
    eyebrow: "помощь", title: "Чем помочь?",
    lead: "Короткие ответы и живая поддержка, когда она нужна.",
    actions: [
      { href: "/help", Icon: Question, title: "Как всё работает", text: "Разборы, приватность и Дневник" },
      { href: "/legal/offer", Icon: CreditCard, title: "Оплата и возвраты", text: "Условия до подтверждения покупки" },
      { href: "/cabinet/support", Icon: Lifebuoy, title: "Написать в поддержку", text: "Диалог с командой ETerapy" },
    ],
  },
} as const;

function Sheet({ open, onOpenChange, title, eyebrow, lead, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string;
  eyebrow: string; lead: string; children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className={styles.sheetBackdrop} />
        <DialogPrimitive.Popup className={styles.sheet}>
          <div className={styles.sheetHandle} aria-hidden="true" />
          <header className={styles.sheetHeader}>
            <div><p className={styles.eyebrow}>{eyebrow}</p><DialogPrimitive.Title className={styles.sheetTitle}>{title}</DialogPrimitive.Title></div>
            <DialogPrimitive.Close className={styles.sheetClose} aria-label="Закрыть"><X size={20} /></DialogPrimitive.Close>
          </header>
          <DialogPrimitive.Description className={styles.sheetLead}>{lead}</DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function UtilitySheet({ utility, data, onClose }: { utility: Utility; data: MiniAppInitialData; onClose: () => void }) {
  const content = utility ? UTILITY_CONTENT[utility] : null;
  if (!content) return null;
  const title = utility === "balance" ? `${data.viewer.points} баллов` : utility === "subscription" ? data.viewer.plan : content.title;
  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }} title={title} eyebrow={content.eyebrow} lead={content.lead}>
      <div className={styles.sheetList}>
        {content.actions.map(({ href, Icon, title: actionTitle, text }) => (
          <Link key={href} href={href} onClick={onClose} className={styles.sheetRow}>
            <span><Icon size={20} /></span><span><strong>{actionTitle}</strong><small>{text}</small></span><ArrowRight size={17} />
          </Link>
        ))}
      </div>
    </Sheet>
  );
}

function ServiceSheet({ service, onClose, onShare }: { service: MiniAppService | null; onClose: () => void; onShare: (title: string, url: string) => Promise<void> }) {
  if (!service) return null;
  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }} title={service.title} eyebrow={service.eyebrow} lead={service.description}>
      <div className={styles.sheetPrice}><strong>{service.price}</strong><span>{service.priceMeta}</span></div>
      <div className={styles.mechanics}>
        {service.mechanics.map((item) => <div key={item}><CheckCircle size={16} weight="fill" /><span>{item}</span></div>)}
      </div>
      <div className={styles.resultPreview}><StarFour size={20} /><span><small>ЧТО ПОЛУЧИТСЯ</small><strong>{service.result}</strong></span></div>
      <p className={styles.privacy}><ShieldCheck size={17} />{service.privacy}</p>
      <div className={styles.sheetActions}>
        <Link href={service.href} onClick={() => track({ event: "miniapp_service_cta", surface: "miniapp", properties: { service: service.id } })} className={styles.primaryButton}>{service.cta}<ArrowRight size={18} /></Link>
        {service.shareable ? <button type="button" className={styles.secondaryButton} onClick={() => onShare(service.title, service.href)}><ShareNetwork size={18} />Пригласить по ссылке</button> : null}
      </div>
    </Sheet>
  );
}

export function MiniAppShell({ data, children }: { data: MiniAppInitialData; children: ReactNode }) {
  const [utility, setUtility] = useState<Utility>(null);
  const [service, setService] = useState<MiniAppService | null>(null);
  const [notice, setNotice] = useState("");
  const pathname = usePathname();

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
      else { await navigator.clipboard.writeText(absolute); notify("Ссылка скопирована"); }
      const kind = url.startsWith("/products/") ? "service" : url.startsWith("/practitioners") ? "practitioner" : "result";
      track({ event: "miniapp_share", surface: "miniapp", properties: { kind } });
    } catch { /* user cancelled native share */ }
  };

  const value: MiniAppContextValue = {
    data,
    openService: setService,
    openUtility: setUtility,
    notify,
    share,
  };

  return (
    <MiniAppV21Context.Provider value={value}>
      <div className={styles.stage} data-testid="miniapp-shell">
        <section className={styles.app} aria-label="ETerapy Mini App">
          <div className={styles.scroll} key={pathname}>
            <TopBar data={data} onUtility={setUtility} />
            {data.loadError ? <div className={styles.inlineError} role="status">Личные данные временно не загрузились. Основные разделы всё равно доступны.</div> : null}
            {children}
          </div>
          <BottomNav />
          <div className={`${styles.toast} ${notice ? styles.toastVisible : ""}`} role="status" aria-live="polite">{notice}</div>
        </section>
      </div>
      <UtilitySheet utility={utility} data={data} onClose={() => setUtility(null)} />
      <ServiceSheet service={service} onClose={() => setService(null)} onShare={share} />
    </MiniAppV21Context.Provider>
  );
}
