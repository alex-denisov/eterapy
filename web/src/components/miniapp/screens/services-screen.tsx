"use client";

import { Fragment, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ChatCircle,
  ChatCircleDots,
  Compass,
  Heart,
  IdentificationCard,
  Moon,
  ShareNetwork,
  StarFour,
  User,
  Users,
  type Icon,
} from "@phosphor-icons/react";
import { MINIAPP_SERVICES } from "@/lib/miniapp/catalog";
import type { MiniAppService } from "@/lib/miniapp/types";
import { pointsWord } from "@/lib/points";
import { MiniAppChrome, useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { miniAppClass as c, styles } from "@/components/miniapp/styles";

type Approach = "all" | "psychology" | "symbolic";
type Format = "all" | "digital" | "specialist";
type ServiceGroup = { id: string; title: string; subtitle: string; layout: "grid" | "wide"; services: MiniAppService[] };

const SERVICE_ICONS: Record<string, Icon> = {
  primary: ChatCircleDots,
  reframe: Compass,
  "deep-report": IdentificationCard,
  "chat-analysis": ChatCircle,
  pair: Users,
  tarot: StarFour,
  "natal-chart": Moon,
  synastry: Heart,
  horary: Compass,
  "tarot-numerology": StarFour,
  numerology: IdentificationCard,
  "human-design": User,
  "surname-story": BookOpen,
  "chat-session": ChatCircle,
};

function makeGroups(services: readonly MiniAppService[]): ServiceGroup[] {
  const byId = new Map(services.map((service) => [service.id, service]));
  const take = (...ids: string[]) => ids.map((id) => byId.get(id)).filter(Boolean) as MiniAppService[];
  const symbolic = services.filter((service) => service.approach === "symbolic");
  const groups: ServiceGroup[] = [
    { id: "free", title: "Начните с вопроса", subtitle: "Первый взгляд бесплатно, без карты", layout: "wide", services: take("primary") },
    { id: "solo", title: "Посмотреть иначе", subtitle: "Самостоятельные разборы вокруг одной ситуации", layout: "grid", services: take("reframe", "deep-report", "chat-analysis") },
    { id: "together", title: "Разобрать вместе", subtitle: "Когда в вопросе участвуют двое", layout: "wide", services: take("pair") },
    { id: "esoteric", title: "Символические практики", subtitle: "Таро, астрология и системы самопознания", layout: "grid", services: symbolic },
    { id: "chat", title: "Продолжить разговор", subtitle: "Диалог вокруг одного вопроса в своём темпе", layout: "wide", services: take("chat-session") },
  ];
  return groups.filter((group) => group.services.length > 0);
}

function CatalogCard({ service, layout }: { service: MiniAppService; layout: ServiceGroup["layout"] }) {
  const { openService, share } = useMiniAppV21();
  const ServiceIcon = SERVICE_ICONS[service.id] ?? StarFour;
  const wide = layout === "wide";
  return (
    <article className={c("catalog-card", wide && "is-wide", service.shareable && "has-share")}>
      <button className={styles["catalog-card-main"]} type="button" onClick={() => openService(service)}>
        <span className={styles["catalog-icon"]}><ServiceIcon size={wide ? 22 : 20} /></span>
        <span className={styles["catalog-copy"]}>
          <strong>{service.title}</strong>
          <p>{service.description}</p>
          <span className={styles["catalog-price"]}><b>{service.price}</b><em>{service.creditCost ? `или ${service.creditCost} ${pointsWord(service.creditCost)}` : service.priceMeta}</em></span>
        </span>
        <ArrowRight className={styles["catalog-arrow"]} size={18} />
      </button>
      {service.shareable ? <button className={styles["catalog-share"]} type="button" aria-label={`Поделиться: ${service.title}`} onClick={() => share(service.title, service.href)}><ShareNetwork size={17} /></button> : null}
    </article>
  );
}

function MinimalSegment({ label, options, value, onChange }: {
  label: string;
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles["minimal-segment"]}>
      <span>{label}</span>
      <div role="group" aria-label={label}>
        {options.map((option) => <button key={option.id} type="button" className={value === option.id ? styles["is-active"] : undefined} aria-pressed={value === option.id} onClick={() => onChange(option.id)}>{option.label}</button>)}
      </div>
    </div>
  );
}

function PlatformDiscovery() {
  const { data, share } = useMiniAppV21();
  const practitioner = data.practitioner;
  return (
    <section className={styles["platform-discovery"]} aria-label="Специалисты и библиотека вопросов">
      <Link className={styles["specialist-spotlight"]} href="/miniapp/practitioners">
        <Image src={practitioner?.avatar ?? "/miniapp/b474/practitioner.png"} alt="Специалист ETerapy" width={160} height={220} unoptimized={Boolean(practitioner?.avatar)} />
        <div>
          <small>ПРОВЕРЕННЫЕ СПЕЦИАЛИСТЫ</small>
          <strong>Когда нужен живой разговор</strong>
          <p>Психолог, коуч или практик. Цена и длительность видны до записи.</p>
          <span>Выбрать время <ArrowRight size={16} /></span>
        </div>
      </Link>

      <div className={styles["library-heading"]}>
        <span><small>БИБЛИОТЕКА ВОПРОСОВ</small><strong>Похожее уже обсуждали</strong></span>
        <Link href="/miniapp/library">Все вопросы</Link>
      </div>
      <div className={styles["library-strip"]}>
        {data.libraryItems.map((entry) => (
          <article key={entry.slug} className={styles["library-question"]}>
            <small>{entry.topic}</small>
            <p>{entry.question}</p>
            <div>
              <Link href={`/miniapp/library/${entry.slug}`}>Читать</Link>
              <button type="button" aria-label={`Поделиться: ${entry.question}`} onClick={() => share(entry.question, `/miniapp/library/${entry.slug}`)}><ShareNetwork size={16} /></button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ServicesScreen() {
  const { data } = useMiniAppV21();
  const [approach, setApproach] = useState<Approach>("all");
  const [format, setFormat] = useState<Format>("all");
  const groups = useMemo(() => makeGroups(MINIAPP_SERVICES), []);
  const visibleGroups = useMemo(() => groups.filter((group) => {
    if (format === "specialist") return false;
    if (approach === "psychology") return group.id !== "esoteric";
    if (approach === "symbolic") return group.id === "esoteric";
    return true;
  }), [approach, format, groups]);
  const showSpecialist = format !== "digital";

  return (
    <MiniAppChrome data={data}>
      <div className={styles["services-screen"]} data-screen="services" data-testid="miniapp-services-screen">
        <section className={styles["services-hero"]}>
          <div><p className={styles.eyebrow}>один вопрос · разные способы</p><h1>Выберите свой способ</h1><p>Начните с вопроса или сразу откройте подходящий формат.</p></div>
          <Image src="/miniapp/b474/service-orbit.png" alt="Абстрактная карта разных взглядов" width={416} height={470} priority />
        </section>

        <section className={styles["service-filter-panel"]} aria-label="Подбор услуг" data-testid="miniapp-service-filters">
          <MinimalSegment label="Подход" options={[{ id: "all", label: "Все" }, { id: "psychology", label: "Психология" }, { id: "symbolic", label: "Символика" }]} value={approach} onChange={(value) => setApproach(value as Approach)} />
          <MinimalSegment label="Формат" options={[{ id: "all", label: "Все" }, { id: "digital", label: "Самостоятельно" }, { id: "specialist", label: "Со специалистом" }]} value={format} onChange={(value) => setFormat(value as Format)} />
        </section>

        <div className={styles["service-shortcuts"]} aria-label="Быстрые входы платформы">
          <Link href="/miniapp/practitioners"><User size={17} /><span><strong>Специалисты</strong><small>Выбрать время</small></span><ArrowRight size={15} /></Link>
          <Link href="/miniapp/library"><BookOpen size={17} /><span><strong>Библиотека</strong><small>Похожие вопросы</small></span><ArrowRight size={15} /></Link>
        </div>

        <div className={styles["catalog-groups"]}>
          {visibleGroups.map((group) => (
            <Fragment key={group.id}>
              <section className={c("catalog-group", `layout-${group.layout}`)} data-group-id={group.id}>
                <header><h2>{group.title}</h2><p>{group.subtitle}</p></header>
                <div className={styles["catalog-grid"]}>{group.services.map((service) => <CatalogCard key={service.id} service={service} layout={group.layout} />)}</div>
              </section>
              {group.id === "solo" && showSpecialist ? <PlatformDiscovery /> : null}
            </Fragment>
          ))}
        </div>

        {showSpecialist && !visibleGroups.some((group) => group.id === "solo") ? <PlatformDiscovery /> : null}
      </div>
    </MiniAppChrome>
  );
}
