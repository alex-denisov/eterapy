"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpen, Brain, Clock, Sparkle, User } from "@phosphor-icons/react";
import { MINIAPP_SERVICES } from "@/lib/miniapp/catalog";
import type { MiniAppServiceApproach, MiniAppServiceFormat } from "@/lib/miniapp/types";
import { useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { PageHeading, SectionHeader, ServiceCard } from "@/components/miniapp/miniapp-ui";
import styles from "@/app/miniapp/miniapp.module.css";

type ApproachFilter = "all" | Exclude<MiniAppServiceApproach, "mixed">;
type FormatFilter = "all" | MiniAppServiceFormat;

export function ServicesScreen() {
  const { data, openService } = useMiniAppV21();
  const [approach, setApproach] = useState<ApproachFilter>("all");
  const [format, setFormat] = useState<FormatFilter>("all");
  const visible = useMemo(() => MINIAPP_SERVICES.filter((service) => {
    const approachMatch = approach === "all" || service.approach === approach || service.approach === "mixed";
    return approachMatch && (format === "all" || service.format === format);
  }), [approach, format]);
  const featured = visible.find((service) => service.featured) ?? visible[0];
  const practitioner = data.practitioner;

  return <div className={styles.screen} data-testid="miniapp-services-screen">
    <PageHeading eyebrow="ФОРМАТ ПОД ВАШ ВОПРОС" title="Услуги" description="Самостоятельный разбор или живой специалист. Подход можно сменить в один касание." />
    <div className={styles.filters} data-testid="miniapp-service-filters">
      <fieldset><legend>ПОДХОД</legend><div>
        <button type="button" className={approach === "all" ? styles.filterActive : ""} onClick={() => setApproach("all")}>Все</button>
        <button type="button" className={approach === "psychology" ? styles.filterActive : ""} onClick={() => setApproach("psychology")}><Brain size={14} />Психология</button>
        <button type="button" className={approach === "symbolic" ? styles.filterActive : ""} onClick={() => setApproach("symbolic")}><Sparkle size={14} />Символические</button>
      </div></fieldset>
      <fieldset><legend>ФОРМАТ</legend><div>
        <button type="button" className={format === "all" ? styles.filterActive : ""} onClick={() => setFormat("all")}>Все</button>
        <button type="button" className={format === "digital" ? styles.filterActive : ""} onClick={() => setFormat("digital")}>Готовый разбор</button>
        <button type="button" className={format === "specialist" ? styles.filterActive : ""} onClick={() => setFormat("specialist")}><User size={14} />Специалист</button>
      </div></fieldset>
    </div>

    {featured ? <button type="button" className={styles.featuredService} onClick={() => openService(featured)}>
      <Image src="/miniapp/b474/service-orbit.png" alt="" width={416} height={470} />
      <span><small>{featured.eyebrow}</small><h2>{featured.title}</h2><p>{featured.description}</p><em>{featured.price} · {featured.creditCost ? `${featured.creditCost} балл` : featured.priceMeta}</em><strong>Подробнее<ArrowRight size={17} /></strong></span>
    </button> : <section className={styles.emptyState}><h2>Такого сочетания пока нет</h2><p>Смените один из фильтров.</p></section>}

    <section className={styles.serviceGrid} aria-label="Каталог услуг">
      {visible.filter((service) => service.id !== featured?.id).map((service) => <ServiceCard key={service.id} service={service} compact />)}
    </section>

    {format !== "digital" ? <section className={styles.practitionerSection}>
      <SectionHeader eyebrow="ЖИВОЙ РАЗГОВОР" title="Специалист рядом" action={<Link className={styles.textLink} href="/practitioners">Все<ArrowRight size={15} /></Link>} />
      <Link href={practitioner?.href ?? "/practitioners"} className={styles.practitionerRow}>
        <Image src={practitioner?.avatar ?? "/miniapp/b474/practitioner.png"} alt="" width={66} height={66} unoptimized={Boolean(practitioner?.avatar)} />
        <span><small>{practitioner ? "РЕКОМЕНДАЦИЯ ПО ТЕКУЩЕЙ ТЕМЕ" : "ПСИХОЛОГИ · КОУЧИ · ПРАКТИКИ"}</small><strong>{practitioner?.name ?? "Выберите своего специалиста"}</strong><em><Clock size={13} />{practitioner?.price ?? "цена видна до записи"}</em></span><ArrowRight size={18} />
      </Link>
    </section> : null}

    <section className={styles.librarySection}>
      <SectionHeader eyebrow="БИБЛИОТЕКА ВОПРОСОВ" title="Иногда помогает чужая формулировка" action={<Link className={styles.textLink} href="/library">Все<ArrowRight size={15} /></Link>} />
      <div>{data.libraryItems.map((item) => <Link key={item.slug} href={item.href} className={styles.libraryRow}><BookOpen size={18} /><span><small>{item.topic}</small><strong>{item.question}</strong></span><ArrowRight size={17} /></Link>)}</div>
    </section>
  </div>;
}
