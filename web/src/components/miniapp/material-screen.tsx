"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarBlank, Paperclip, ShieldCheck } from "@phosphor-icons/react";
import { MiniAppChrome, useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { styles } from "@/components/miniapp/styles";

export function MiniAppMaterialScreen({
  practitioner,
  text,
  date,
  attachment,
}: {
  practitioner: string;
  text: string;
  date: string;
  attachment: { url: string; name: string } | null;
}) {
  const { data } = useMiniAppV21();
  const router = useRouter();
  useEffect(() => { router.refresh(); }, [router]);
  return (
    <MiniAppChrome data={data}>
      <article className={styles.subpage} data-testid="miniapp-material-detail">
        <header className={styles["material-head"]}><Link href="/miniapp/profile/materials" aria-label="Назад к материалам"><ArrowLeft size={18} /></Link><div><p className={styles.eyebrow}>от специалиста</p><h1>{practitioner}</h1><span>{date}</span></div></header>
        <section className={styles["material-body"]}><p>{text}</p>{attachment ? <a href={attachment.url} target="_blank" rel="noreferrer"><Paperclip size={18} /><span><strong>{attachment.name}</strong><small>Открыть вложение</small></span></a> : null}</section>
        <p className={styles["flow-note"]}><ShieldCheck size={16} />Материал доступен только в вашем аккаунте. Ответить здесь нельзя — обсудите его на следующей сессии.</p>
        <Link className={styles["journey-secondary"]} href="/miniapp/profile/bookings"><CalendarBlank size={17} />Мои записи</Link>
      </article>
    </MiniAppChrome>
  );
}
