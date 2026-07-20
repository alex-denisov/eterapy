"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CaretRight, Check, Clock, Microphone, ShareNetwork } from "@phosphor-icons/react";
import { MINIAPP_SERVICES } from "@/lib/miniapp/catalog";
import { MiniAppChrome, useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { miniAppClass as c, styles } from "@/components/miniapp/styles";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

// B554: приветствие было захардкожено «Добрый вечер» — первая же строка первого
// экрана сообщала пользователю, что приложение за ним не следит.
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

export function HomeScreen() {
  const { data, viewerName, openService, notify, share } = useMiniAppV21();
  const [question, setQuestion] = useState("");
  const router = useRouter();
  const reframe = MINIAPP_SERVICES.find((service) => service.id === "reframe")!;
  const active = data.dialogues[0];
  const latest = data.diaryItems[0];
  const today = new Date().getDay();
  const dailyDone = data.completedWeekdays.includes(today);

  const submit = () => {
    const value = question.trim();
    if (value.length < 3) {
      notify("Напишите вопрос хотя бы в нескольких словах");
      return;
    }
    window.sessionStorage.setItem("eterapy:miniapp-question", value);
    router.push("/miniapp/checkin?miniappDraft=1");
  };

  return (
    <MiniAppChrome data={data}>
      <div className={styles["home-screen"]} data-screen="home" data-testid="miniapp-home-screen">
        <section className={styles["home-hero"]} aria-labelledby="miniapp-home-title">
          <div className={styles["home-hero-copy"]}>
            <p className={styles.greeting}>{greeting()}, {viewerName}</p>
            <h1 id="miniapp-home-title">Что хочется прояснить?</h1>
          </div>
          <span className={styles["halo-crop"]} aria-hidden="true">
            <Image className={styles["halo-hero"]} src="/miniapp/b474/halo-source.png" alt="" width={853} height={1844} priority />
          </span>
        </section>

        <section className={styles["question-panel"]} aria-label="Новый вопрос">
          <label className={styles["sr-only"]} htmlFor="miniapp-question">Опишите ситуацию своими словами</label>
          <textarea id="miniapp-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1200} placeholder="Опишите ситуацию своими словами" data-testid="home-start-question-input" />
          <div className={styles["question-tools"]}>
            <span>{question.length} / 1200</span>
            <button type="button" className={styles["voice-button"]} aria-label="Записать голосом" onClick={() => notify("Голосовой ввод появится в одном из следующих обновлений")}><Microphone size={22} weight="fill" /></button>
          </div>
        </section>

        <button className={styles["primary-action"]} type="button" onClick={submit} data-testid="home-start-dialogue-button">Начать разбор</button>

        {active ? (
          <Link href={`/miniapp/dialogues/${encodeURIComponent(active.id)}`} className={styles["continue-row"]}>
            <span className={styles["continue-icon"]}><Clock size={23} /></span>
            <span className={styles["continue-copy"]}><small>ПРОДОЛЖИТЬ ДИАЛОГ</small><strong>{active.title}</strong></span>
            <CaretRight size={24} />
          </Link>
        ) : (
          <Link href="/miniapp/help#dialogue" className={styles["continue-row"]}>
            <span className={styles["continue-icon"]}><Clock size={23} /></span>
            <span className={styles["continue-copy"]}><small>КАК ЭТО РАБОТАЕТ</small><strong>Один вопрос, короткий диалог</strong></span>
            <CaretRight size={24} />
          </Link>
        )}

        <button className={styles["service-teaser"]} type="button" onClick={() => openService(reframe)}>
          <span><small>ПОДХОДИТ СЕЙЧАС</small><strong>{reframe.title}</strong><em>Ситуация под четырьмя углами · {reframe.price}</em></span>
          <Image src="/miniapp/b474/service-orbit.png" alt="" width={416} height={470} />
        </button>

        <section className={c("daily-card", "home-daily")}>
          <div className={styles["section-title-row"]}>
            <span><small>ВОПРОС ДНЯ</small><strong>{dailyDone ? "Запись сохранена" : "Что сегодня получилось сделать по-своему?"}</strong></span>
            {data.streak > 0 ? <span className={styles["streak-pill"]}>{data.streak} дня</span> : null}
          </div>
          {dailyDone ? (
            <div className={styles["daily-result"]}><span className={styles["daily-result-mark"]}><Check size={20} weight="bold" /></span><p>Сегодняшняя запись уже в Дневнике. Её можно дополнить в любой момент.</p></div>
          ) : (
            <Link className={styles["daily-answer"]} href={data.viewer.authenticated ? "/miniapp/diary" : "/miniapp/account?intent=diary"}>Ответить в Дневнике <ArrowRight size={17} /></Link>
          )}
          <div className={styles["week-mini"]} aria-label="Практика на этой неделе">
            {WEEKDAYS.map((day, index) => {
              const weekday = (index + 1) % 7;
              return <span key={day} className={c(data.completedWeekdays.includes(weekday) && "is-done", weekday === today && "is-today")}>{day}</span>;
            })}
          </div>
        </section>

        {latest ? (
          <section className={styles["home-results"]}>
            <div className={styles["section-title-row"]}>
              <span><small>СВЕЖИЙ РЕЗУЛЬТАТ</small><strong>{latest.title}</strong></span>
              <button type="button" aria-label="Поделиться результатом" onClick={() => share(latest.title, latest.href)}><ShareNetwork size={19} /></button>
            </div>
            <p>{latest.insight}</p>
            <Link className={styles["text-action"]} href={`/miniapp/diary/${encodeURIComponent(latest.id)}`}>Открыть в Дневнике <ArrowRight size={16} /></Link>
          </section>
        ) : null}
      </div>
    </MiniAppChrome>
  );
}
