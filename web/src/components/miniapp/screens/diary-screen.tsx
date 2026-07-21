"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Eye, Lock, ShareNetwork, StarFour } from "@phosphor-icons/react";
import { MINIAPP_DIARY_SERVICE } from "@/lib/miniapp/catalog";
import { pluralRu } from "@/lib/streak-display";
import { MiniAppChrome, useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { MiniAppDiaryPinButton, MiniAppDiaryPinGate } from "@/components/miniapp/diary-pin";
import { miniAppClass as c, styles } from "@/components/miniapp/styles";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
// Тот же шаг, что у веба (`RevealList` в кабинете): четыре записи и «показать ещё».
const DIARY_PAGE_SIZE = 4;
// Заглушка темы для записей, у которых её нет (результаты услуг) — см. server-data.
const GENERIC_TOPIC = "Личное";

// B554: числа в полосе недели были захардкожены (14…20) и совпадали с реальным
// календарём одну неделю в месяц. Дневник — это личная запись пользователя;
// выдуманные даты в ней подрывают доверие ко всему продукту.
function currentWeekDates(): number[] {
  const today = new Date();
  const mondayOffset = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return day.getDate();
  });
}

export function DiaryScreen() {
  const { data, share, notify, openService } = useMiniAppV21();
  const router = useRouter();
  const completedToday = data.completedWeekdays.includes(new Date().getDay());
  const [reflection, setReflection] = useState("");
  const [dailyDone, setDailyDone] = useState(completedToday);
  const [saving, setSaving] = useState(false);
  const [perspective, setPerspective] = useState("");
  const [topic, setTopic] = useState("Все");
  const [activeJournalId, setActiveJournalId] = useState(data.journalEntries[0]?.id ?? "");
  const [visibleItems, setVisibleItems] = useState(DIARY_PAGE_SIZE);
  const weekDates = useMemo(() => currentWeekDates(), []);
  // B554 п.18: фильтр строился по `item.topic`, а у результатов услуг тема всегда
  // одна («Личное») — получались две кнопки, «Все» и «Личное», с одинаковым
  // списком. Различаются записи типом, по нему и фильтруем.
  const topics = useMemo(() => ["Все", ...Array.from(new Set(data.diaryItems.map((item) => item.type))).slice(0, 4)], [data.diaryItems]);
  const filtered = useMemo(() => topic === "Все" ? data.diaryItems : data.diaryItems.filter((item) => item.type === topic), [data.diaryItems, topic]);
  const activeJournal = data.journalEntries.find((entry) => entry.id === activeJournalId) ?? data.journalEntries[0];
  // B554 п.18/20: у результатов услуг темы нет, и `topic` приходил заглушкой
  // «Личное» — наблюдение всегда срабатывало и всегда сообщало «тема "личное"
  // возвращается в ваших разборах». Считаем только настоящие темы.
  const repeatedTopic = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of data.diaryItems) {
      if (item.topic === GENERIC_TOPIC) continue;
      counts.set(item.topic, (counts.get(item.topic) ?? 0) + 1);
    }
    return Array.from(counts.entries()).find(([, count]) => count > 1)?.[0] ?? null;
  }, [data.diaryItems]);

  const saveReflection = async () => {
    const value = reflection.trim();
    if (value.length < 3) {
      notify("Напишите хотя бы несколько слов");
      return;
    }
    if (!data.viewer.authenticated) {
      window.sessionStorage.setItem("eterapy:miniapp-diary-draft", value);
      router.push("/miniapp/account?intent=diary");
      return;
    }
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
      setDailyDone(true);
      router.refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось сохранить запись");
    } finally {
      setSaving(false);
    }
  };

  return (
    <MiniAppChrome data={data}>
      <div className={styles["diary-screen"]} data-screen="diary" data-testid="miniapp-diary-screen">
        <section className={styles["page-heading"]}>
          <div className={styles["page-heading-copy"]}><p className={styles.eyebrow}>дневник</p><h1>Ваше пространство</h1><p className={styles["page-description"]}>Вопросы, разборы и заметки. Видите только вы.</p></div>
          {/* B554 п.19: замок открывает PIN Дневника, а не страницу смены пароля аккаунта. */}
          <MiniAppDiaryPinButton />
        </section>

        <MiniAppDiaryPinGate>
        <section className={styles["diary-practice"]}>
          <div className={styles["practice-head"]}>
            <span><small>ВОПРОС ДНЯ · ДЛЯ ВАС</small><strong>Что сегодня помогло вам не торопиться с решением?</strong></span>
            <span className={styles["streak-ring"]}><b>{data.streak}</b><small>{pluralRu(data.streak, ["день", "дня", "дней"])}</small></span>
          </div>
          {dailyDone ? (
            <div className={styles["practice-answer"]}><span><Check size={20} weight="bold" /></span><div><small>ВАШ ВЗГЛЯД</small><p>{reflection || "Сегодняшняя запись уже сохранена."}</p><small>МАЛЕНЬКИЙ ШАГ</small><p>{perspective || "Можно вернуться к мысли позже, без требования решить всё сегодня."}</p></div></div>
          ) : (
            <div className={styles["practice-form"]}><textarea value={reflection} onChange={(event) => setReflection(event.target.value)} placeholder="Несколько слов для себя" aria-label="Ответ на вопрос дня" /><button type="button" disabled={saving} onClick={saveReflection}>{saving ? "Сохраняем…" : data.viewer.authenticated ? "Получить взгляд" : "Сохранить в своём Дневнике"}<ArrowRight size={17} /></button></div>
          )}
          <div className={styles["week-strip"]} aria-label="Практика на этой неделе">
            {WEEKDAYS.map((day, index) => {
              const weekday = (index + 1) % 7;
              const done = data.completedWeekdays.includes(weekday);
              // Числа недели считаются от локальной даты клиента — расхождение
              // с серверной отрисовкой здесь ожидаемо (React error #418).
              return <span key={day} className={c(done && "is-done", weekday === new Date().getDay() && "is-today")}><small>{day}</small><b suppressHydrationWarning>{done ? <Check size={14} weight="bold" /> : weekDates[index]}</b></span>;
            })}
          </div>
          <p className={styles["practice-footnote"]}>На 7-й день серии соберём итог недели: что повторялось и что менялось.</p>
        </section>

        {/* B554 п.20: раньше здесь стояли пять последних РАЗБОРОВ, поэтому в ряду
            повторялись числа («20, 20, 20, 20, 17») и у каждого была одна и та же
            подпись «Личное». Это дни практики — те же карточки, что в вебе:
            день, вопрос этого дня и то, что человек на него получил. */}
        {activeJournal ? (
          <section className={styles["journal-history"]}>
            <div className={styles["section-title-row"]}><span><small>ВАШИ ЗАПИСИ</small><strong>Последние дни</strong></span></div>
            <div className={styles["journal-day-buttons"]} role="tablist" aria-label="Последние записи">{data.journalEntries.map((entry) => <button key={entry.id} type="button" role="tab" aria-selected={entry.id === activeJournal.id} className={entry.id === activeJournal.id ? styles["is-active"] : undefined} onClick={() => setActiveJournalId(entry.id)}><small>{entry.dayLabel}</small><span>{entry.monthLabel}</span></button>)}</div>
            <article className={styles["journal-expanded"]} role="tabpanel">
              <small>{activeJournal.fullDateLabel} · {activeJournal.own ? "ваш вопрос" : "вопрос дня"}</small>
              <p>«{activeJournal.question}»</p>
              {activeJournal.perspective ? <><small>ВЗГЛЯД ДНЯ</small><p>{activeJournal.perspective}</p></> : null}
              {activeJournal.step ? <><small>МАЛЕНЬКИЙ ШАГ</small><p>{activeJournal.step}</p></> : null}
              {!activeJournal.perspective && !activeJournal.step ? <p>В этот день вы отметили практику без развёрнутого ответа.</p> : null}
            </article>
          </section>
        ) : null}

        {repeatedTopic ? <section className={styles["diary-observation"]}><span className={styles["observation-mark"]}><Eye size={20} /></span><div><small>НАБЛЮДЕНИЕ</small><p>Тема «{repeatedTopic.toLocaleLowerCase("ru")}» возвращается в ваших разборах. Возможно, сейчас полезно заметить не один ответ, а повторяющийся способ действовать.</p><em>Это просто наблюдение, можно ничего не делать.</em></div></section> : null}

        <section className={styles["diary-items-block"]}>
          <div className={styles["section-title-row"]}><span><small>ВАШИ РАЗБОРЫ</small><strong>{filtered.length} сохранено</strong></span></div>
          {data.viewer.authenticated ? (
            <>
              {topics.length > 2 ? <div className={c("filter-row", "diary-filters")} role="group" aria-label="Фильтр по типу записи">{topics.map((item) => <button key={item} type="button" className={topic === item ? styles["is-selected"] : undefined} aria-pressed={topic === item} onClick={() => { setTopic(item); setVisibleItems(DIARY_PAGE_SIZE); }}>{item}</button>)}</div> : null}
              {/* B554 п.18: список выводился целиком — на два десятка записей
                  экран превращался в бесконечную ленту. Показываем по четыре. */}
              <div className={styles["diary-item-list"]}>{filtered.slice(0, visibleItems).map((item) => <article key={item.id}><Link className={styles["diary-item-main"]} href={`/miniapp/diary/${encodeURIComponent(item.id)}`}><span className={styles["diary-item-icon"]}><StarFour size={19} /></span><span><em>{item.topic} · {item.type}</em><strong>{item.title}</strong><small>{item.date}</small></span><ArrowRight size={17} /></Link><button className={styles["diary-share"]} type="button" aria-label={`Поделиться: ${item.title}`} onClick={() => share(item.title, `/miniapp/diary/${item.id}`)}><ShareNetwork size={17} /></button></article>)}</div>
              {filtered.length > visibleItems ? <button className={styles["diary-more"]} type="button" onClick={() => setVisibleItems((current) => current + DIARY_PAGE_SIZE)}>Показать ещё ({filtered.length - visibleItems})</button> : null}
            </>
          ) : <div className={styles["empty-state"]}><Lock size={29} /><h2>Дневник должен помнить именно вас</h2><p>Добавьте email и пароль перед сохранением личных результатов.</p><Link href="/miniapp/account?intent=diary">Создать личное пространство</Link></div>}
        </section>

        {MINIAPP_DIARY_SERVICE && data.diaryItems.length >= 2 ? <section className={styles["family-scenario"]}><div><small>ПОВТОРЯЮЩАЯСЯ ТЕМА</small><strong>{MINIAPP_DIARY_SERVICE.title}</strong><p>{MINIAPP_DIARY_SERVICE.description}</p></div><button type="button" onClick={() => openService(MINIAPP_DIARY_SERVICE!)}>Посмотреть <ArrowRight size={16} /></button></section> : null}
        </MiniAppDiaryPinGate>
      </div>
    </MiniAppChrome>
  );
}
