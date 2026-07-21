"use client";

import Image from "next/image";
import Link from "next/link";
import { CaretLeft, User } from "@phosphor-icons/react";
import type { MiniAppPractitionerCard } from "@/lib/miniapp/journey-data";
import { styles } from "@/components/miniapp/styles";

/**
 * B557: общие детали внутренних экранов мини-аппа. Жили приватно в
 * `journey-screens.tsx`; вынесены, чтобы экран записи мог их взять, не
 * притаскивая за собой весь модуль журнала.
 */
export function BackLink({ href, label = "Назад" }: { href: string; label?: string }) {
  return (
    <Link href={href} className={styles["subpage-back"]} aria-label={label}>
      <CaretLeft size={21} /><span className={styles["sr-only"]}>{label}</span>
    </Link>
  );
}

export function PageHead({ eyebrow, title, description, back }: {
  eyebrow: string;
  title: string;
  description?: string;
  back: string;
}) {
  return (
    <header className={styles["subpage-head"]}>
      <div className={styles["subpage-title-row"]}>
        <BackLink href={back} />
        <div><p className={styles.eyebrow}>{eyebrow}</p><h1>{title}</h1></div>
      </div>
      {description ? <p>{description}</p> : null}
    </header>
  );
}

/** Первые буквы имени и фамилии: «Марина Озерова» → «МО». */
function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

/**
 * B559: у сидированных специалистов фотографий нет, и одинаковый серый силуэт
 * на каждой карточке читался как «профиль не загрузился». Пока фотографий нет,
 * показываем инициалы на своём оттенке — состояние выглядит осознанным, а люди
 * различаются между собой. Оттенок детерминирован по имени: у одного человека
 * он всегда один и тот же.
 */
export function PractitionerAvatar({ practitioner, size = 56 }: {
  practitioner: MiniAppPractitionerCard;
  size?: number;
}) {
  if (practitioner.avatar) {
    return <Image className={styles["practitioner-avatar"]} src={practitioner.avatar} alt="" width={size} height={size} />;
  }
  const hue = [...practitioner.name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  const label = initials(practitioner.name);
  return (
    <span
      className={styles["practitioner-avatar-fallback"]}
      style={{ "--avatar-hue": hue, fontSize: `${Math.round(size * 0.28)}px` } as React.CSSProperties}
      aria-hidden="true"
    >
      {label || <User size={Math.round(size * .45)} weight="fill" />}
    </span>
  );
}
