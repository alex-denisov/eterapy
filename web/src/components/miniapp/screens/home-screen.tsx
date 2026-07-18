"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CaretRight, Check, Clock, Microphone, ShareNetwork } from "@phosphor-icons/react";
import { MINIAPP_SERVICES } from "@/lib/miniapp/catalog";
import { useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { SectionHeader } from "@/components/miniapp/miniapp-ui";
import styles from "@/app/miniapp/miniapp.module.css";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function HomeScreen() {
  const { data, openService, notify, share } = useMiniAppV21();
  const [question, setQuestion] = useState("");
  const router = useRouter();
  const reframe = MINIAPP_SERVICES.find((service) => service.id === "reframe")!;
  const active = data.dialogues[0];
  const latest = data.diaryItems[0];
  const dailyDone = data.completedWeekdays.includes(new Date().getDay());

  const submit = () => {
    const value = question.trim();
    if (value.length < 3) return notify("Напишите вопрос хотя бы в нескольких словах");
    router.push(`/checkin?question=${encodeURIComponent(value)}`);
  };

  return <div className={styles.screen} data-testid="miniapp-home-screen">
    <section className={styles.homeHero} aria-labelledby="miniapp-home-title">
      <div><p>Рады видеть, {data.viewer.firstName}</p><h1 id="miniapp-home-title">Что хочется прояснить?</h1></div>
      <span className={styles.haloCrop} aria-hidden="true"><Image src="/miniapp/b474/halo-source.png" alt="" width={853} height={1844} priority /></span>
    </section>

    <section className={styles.questionPanel} aria-label="Новый вопрос">
      <label className={styles.srOnly} htmlFor="miniapp-question">Опишите ситуацию своими словами</label>
      <textarea id="miniapp-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1200} placeholder="Опишите ситуацию своими словами" data-testid="home-start-question-input" />
      <div><span>{question.length} / 1200</span><button type="button" aria-label="Записать голосом" onClick={() => notify("Голосовой ввод подключим отдельным безопасным этапом")}><Microphone size={22} weight="fill" /></button></div>
    </section>
    <button className={styles.primaryButton} type="button" onClick={submit} data-testid="home-start-dialogue-button">Начать разбор</button>

    {active ? <Link href={active.href} className={styles.continueRow}><span><Clock size={22} /></span><span><small>ПРОДОЛЖИТЬ ДИАЛОГ</small><strong>{active.title}</strong><em>{active.status}</em></span><CaretRight size={22} /></Link> : null}

    <button className={styles.serviceTeaser} type="button" onClick={() => openService(reframe)}>
      <span><small>ПОДХОДИТ ДЛЯ НОВОГО ВЗГЛЯДА</small><strong>{reframe.title}</strong><em>{reframe.price} · {reframe.creditCost} балл</em></span>
      <Image src="/miniapp/b474/service-orbit.png" alt="" width={416} height={470} />
    </button>

    <section className={styles.dailyCard}>
      <SectionHeader eyebrow="ВОПРОС ДНЯ" title={dailyDone ? "Запись сохранена" : "Что сегодня получилось сделать по-своему?"} action={data.streak > 0 ? <span className={styles.streak}>{data.streak} дня</span> : null} />
      {dailyDone ? <div className={styles.dailyResult}><Check size={19} weight="bold" /><p>Сегодняшняя запись уже в Дневнике. Вернитесь к ней, если захочется дополнить мысль.</p></div> : <Link className={styles.dailyAnswer} href={data.viewer.authenticated ? "/miniapp/diary" : `/register?next=${encodeURIComponent("/miniapp/diary")}`}>Ответить в Дневнике<ArrowRight size={17} /></Link>}
      <div className={styles.weekMini} aria-label="Практика на этой неделе">{WEEKDAYS.map((day, index) => <span key={day} className={data.completedWeekdays.includes((index + 1) % 7) ? styles.dayDone : index === (new Date().getDay() + 6) % 7 ? styles.dayToday : ""}>{day}</span>)}</div>
    </section>

    {latest ? <section className={styles.homeResult}><SectionHeader eyebrow="СВЕЖИЙ РЕЗУЛЬТАТ" title={latest.title} action={<button type="button" aria-label="Поделиться" onClick={() => share(latest.title, latest.href)}><ShareNetwork size={19} /></button>} /><p>{latest.insight}</p><Link className={styles.textLink} href="/miniapp/diary">Открыть в Дневнике<ArrowRight size={16} /></Link></section> : null}
  </div>;
}
