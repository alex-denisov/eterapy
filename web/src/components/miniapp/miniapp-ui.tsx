"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, LockKey, StarFour } from "@phosphor-icons/react";
import type { MiniAppService } from "@/lib/miniapp/types";
import { useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import styles from "@/app/miniapp/miniapp.module.css";

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <section className={styles.pageHeading}><div>{eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}<h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{action}</section>;
}

export function SectionHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return <div className={styles.sectionHeader}><span><small>{eyebrow}</small><strong>{title}</strong></span>{action}</div>;
}

export function AccountGate({ title, text, next = "/miniapp" }: { title: string; text: string; next?: string }) {
  return <section className={styles.accountGate} data-testid="miniapp-account-gate"><span className={styles.gateIcon}><LockKey size={23} /></span><div><h2>{title}</h2><p>{text}</p></div><Link href={`/register?next=${encodeURIComponent(next)}`} className={styles.primaryButton}>Сохранить прогресс<ArrowRight size={18} /></Link><Link href={`/login?next=${encodeURIComponent(next)}`} className={styles.textLink}>Уже есть аккаунт</Link></section>;
}

export function ServiceCard({ service, compact = false }: { service: MiniAppService; compact?: boolean }) {
  const { openService } = useMiniAppV21();
  return <button type="button" className={`${styles.serviceCard} ${compact ? styles.serviceCardCompact : ""}`} onClick={() => openService(service)} data-service={service.id}><span className={styles.serviceCardIcon}><StarFour size={20} /></span><span className={styles.serviceCardCopy}><small>{service.eyebrow}</small><strong>{service.title}</strong><p>{service.description}</p><em>{service.price}{service.creditCost ? ` · ${service.creditCost} балла` : ""}</em></span><ArrowRight size={18} /></button>;
}
