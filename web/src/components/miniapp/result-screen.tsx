"use client";

import Link from "next/link";
import { ArrowLeft, Clock, Notebook, Sparkle } from "@phosphor-icons/react";
import { SoftMarkdown } from "@/components/ui/soft-markdown";
import { MiniAppChrome, useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { styles } from "@/components/miniapp/styles";

export function MiniAppResultScreen({
  title,
  label,
  body,
  ready,
  updated,
}: {
  title: string;
  label: string;
  body: string;
  ready: boolean;
  updated: string;
}) {
  const { data } = useMiniAppV21();
  return (
    <MiniAppChrome data={data}>
      <article className={styles.subpage} data-testid="miniapp-result">
        <header className={styles["result-native-head"]}>
          <Link href="/miniapp/diary" aria-label="Назад в Дневник"><ArrowLeft size={18} /></Link>
          <p className={styles.eyebrow}>{label}</p>
          <h1>{title}</h1>
          <span><Clock size={14} />обновлён {updated}</span>
        </header>
        <section className={styles["result-native-body"]}>
          {ready ? body ? <SoftMarkdown content={body} /> : <p>Результат готов, но текст пока не загрузился. Поддержка поможет восстановить его.</p> : <div className={styles["result-pending"]}><Sparkle size={22} /><strong>Разбор ещё готовится</strong><p>Обычно это занимает 1–2 минуты. Вернитесь немного позже.</p></div>}
        </section>
        <Link className={styles["journey-secondary"]} href="/miniapp/diary"><Notebook size={17} />Вернуться в Дневник</Link>
      </article>
    </MiniAppChrome>
  );
}
