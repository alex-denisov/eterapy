"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChatCircleDots, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { AccountGate, PageHeading } from "@/components/miniapp/miniapp-ui";
import styles from "@/app/miniapp/miniapp.module.css";

export function DialoguesScreen() {
  const { data } = useMiniAppV21();
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const value = query.trim().toLocaleLowerCase("ru");
    return value ? data.dialogues.filter((item) => item.title.toLocaleLowerCase("ru").includes(value)) : data.dialogues;
  }, [data.dialogues, query]);
  const focus = visible[0];

  return <div className={styles.screen} data-testid="miniapp-dialogues-screen">
    <PageHeading eyebrow="В ПРОЦЕССЕ" title="Диалоги" description="Только живые цепочки. Готовые итоги находятся в Дневнике." action={<Link href="/checkin" className={styles.roundAction} aria-label="Новый диалог"><Plus size={21} /></Link>} />
    {!data.viewer.authenticated ? <AccountGate title="Продолжайте без потери контекста" text="Добавьте email и пароль, чтобы диалоги были доступны и в Mini App, и на сайте." next="/miniapp/dialogues" /> : null}
    {data.viewer.authenticated ? <>
      <label className={styles.search}><MagnifyingGlass size={18} /><span className={styles.srOnly}>Найти диалог</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти диалог" /></label>
      {focus ? <Link href={focus.href} className={styles.focusDialogue}><span><small>{focus.topic} · {focus.status}</small><strong>{focus.title}</strong><p>Вернитесь к последнему уточнению и продолжите с того же места.</p><em>{focus.updated} · {focus.messageCount} сообщений</em></span><ArrowRight size={20} /></Link> : null}
      <section className={styles.dialogueList} aria-label="Активные диалоги">
        {visible.slice(1).map((dialogue) => <Link key={dialogue.id} href={dialogue.href} className={styles.dialogueRow}><span className={styles.dialogueMark}><ChatCircleDots size={20} /></span><span><small>{dialogue.topic} · {dialogue.status}</small><strong>{dialogue.title}</strong><em>{dialogue.updated} · {dialogue.messageCount} сообщений</em></span><ArrowRight size={18} /></Link>)}
      </section>
      {visible.length === 0 ? <section className={styles.emptyState}><ChatCircleDots size={28} /><h2>{query ? "Ничего не нашли" : "Пока нет активных диалогов"}</h2><p>{query ? "Попробуйте другое слово." : "Задайте вопрос, первый разбор бесплатный."}</p><Link className={styles.primaryButton} href="/checkin">Начать диалог<ArrowRight size={18} /></Link></section> : null}
      <Link className={styles.diaryBridge} href="/miniapp/diary"><span><small>ГОТОВЫЕ ИТОГИ</small><strong>Все завершённые разборы в Дневнике</strong></span><ArrowRight size={18} /></Link>
    </> : null}
  </div>;
}
