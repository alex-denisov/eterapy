"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, Check, LockKey, ShareNetwork, ShieldCheck } from "@phosphor-icons/react";
import { MINIAPP_DIARY_SERVICE } from "@/lib/miniapp/catalog";
import { useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { AccountGate, PageHeading, SectionHeader, ServiceCard } from "@/components/miniapp/miniapp-ui";
import styles from "@/app/miniapp/miniapp.module.css";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function DiaryScreen() {
  const { data, share, notify } = useMiniAppV21();
  const router = useRouter();
  const completedToday = data.completedWeekdays.includes(new Date().getDay());
  const [answered, setAnswered] = useState(completedToday);
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState("");
  const [saving, setSaving] = useState(false);
  const [perspective, setPerspective] = useState("");

  const saveReflection = async () => {
    const value = question.trim();
    if (value.length < 3) return notify("Запишите хотя бы несколько слов");
    setSaving(true);
    try {
      const response = await fetch("/api/cabinet/daily-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reflect", question: value }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Не удалось сохранить запись");
      setPerspective(payload.card?.perspective ?? "Запись сохранена. Вернитесь к ней позже и посмотрите, что изменилось.");
      setAnswered(true);
      setEditing(false);
      router.refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось сохранить запись");
    } finally {
      setSaving(false);
    }
  };
  if (!data.viewer.authenticated) return <div className={styles.screen} data-testid="miniapp-diary-screen"><PageHeading eyebrow="ЛИЧНОЕ ПРОСТРАНСТВО" title="Дневник" description="История вопросов, результатов и маленьких шагов." /><AccountGate title="Дневник должен помнить именно вас" text="Добавьте email и пароль перед сохранением личных результатов. После этого они будут доступны и на сайте." next="/miniapp/diary" /></div>;

  return <div className={styles.screen} data-testid="miniapp-diary-screen">
    <PageHeading eyebrow="ВАША ЛИЧНАЯ КАРТА" title="Дневник" description="Готовые итоги, наблюдения и ритм практики в одном месте." action={<span className={styles.roundAction} aria-label="Видно только вам"><LockKey size={20} /></span>} />
    <section className={styles.diaryHero}>
      <SectionHeader eyebrow="ВОПРОС ДНЯ" title={answered ? "Сегодняшняя запись готова" : "Что сегодня стало чуть яснее?"} action={data.streak > 0 ? <span className={styles.streak}>{data.streak} дня</span> : null} />
      {answered ? <div className={styles.dailyResult}><Check size={19} weight="bold" /><p>{perspective || "Сегодняшняя запись уже сохранена в вашем личном Дневнике."}</p></div> : editing ? <div className={styles.practiceComposer}><label className={styles.srOnly} htmlFor="miniapp-daily-question">Вопрос дня</label><textarea id="miniapp-daily-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={600} autoFocus placeholder="Запишите мысль или вопрос своими словами" /><button type="button" className={styles.primaryButton} disabled={saving} onClick={saveReflection}>{saving ? "Сохраняем…" : "Получить взгляд дня"}<ArrowRight size={17} /></button></div> : <button type="button" className={styles.dailyAnswer} onClick={() => setEditing(true)}>Записать для себя<ArrowRight size={17} /></button>}
      <div className={styles.weekMini}>{WEEKDAYS.map((day, index) => <span key={day} className={data.completedWeekdays.includes((index + 1) % 7) ? styles.dayDone : ""}>{day}</span>)}</div>
      <p className={styles.privateNote}><ShieldCheck size={15} />Вопрос дня и ответы видны только вам</p>
    </section>

    <section className={styles.diaryTimeline}>
      <SectionHeader eyebrow="ВАШИ РЕЗУЛЬТАТЫ" title={data.diaryItems.length ? `${data.diaryItems.length} последних записей` : "Здесь появятся готовые итоги"} />
      {data.diaryItems.map((item) => <article key={item.id} className={styles.diaryItem}><Link href={item.href}><span><small>{item.type} · {item.topic}</small><strong>{item.title}</strong><em>{item.date}</em><p>{item.insight}</p></span><ArrowRight size={18} /></Link><button type="button" aria-label={`Поделиться: ${item.title}`} onClick={() => share(item.title, item.href)}><ShareNetwork size={17} /></button></article>)}
      {data.diaryItems.length === 0 ? <div className={styles.emptyState}><BookOpen size={29} /><h2>Дневник пока чист</h2><p>Завершите первый разбор, итог сохранится автоматически.</p><Link className={styles.primaryButton} href="/checkin">Начать разбор<ArrowRight size={18} /></Link></div> : null}
    </section>

    {MINIAPP_DIARY_SERVICE ? <section className={styles.diaryRecommendation}><SectionHeader eyebrow="ПО ПОВТОРЯЮЩИМСЯ ТЕМАМ" title="Если хочется увидеть семейный контекст" /><ServiceCard service={MINIAPP_DIARY_SERVICE} /></section> : null}
  </div>;
}
