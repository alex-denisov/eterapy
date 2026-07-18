"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChatCircleDots, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { MiniAppChrome, useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { styles } from "@/components/miniapp/styles";

export function DialoguesScreen() {
  const { data } = useMiniAppV21();
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const value = query.trim().toLocaleLowerCase("ru");
    return value ? data.dialogues.filter((item) => item.title.toLocaleLowerCase("ru").includes(value)) : data.dialogues;
  }, [data.dialogues, query]);
  const focus = visible[0];

  return (
    <MiniAppChrome data={data}>
      <div className={styles["dialogues-screen"]} data-screen="dialogues" data-testid="miniapp-dialogues-screen">
        <section className={styles["page-heading"]}>
          <div className={styles["page-heading-copy"]}>
            <p className={styles.eyebrow}>разговор продолжается</p>
            <h1>Диалоги</h1>
            <p className={styles["page-description"]}>Здесь только вопросы, к которым ещё можно вернуться. Готовые выводы хранятся в Дневнике.</p>
          </div>
          <Link className={styles["round-action"]} href="/miniapp/dialogues/new" aria-label="Новый вопрос"><Plus size={22} /></Link>
        </section>

        {data.viewer.authenticated && focus ? (
          <section className={styles["dialogue-focus"]}>
            <div><span>ПРОДОЛЖИТЬ</span><strong>{focus.title}</strong><p>Вернитесь к последнему уточнению и продолжите с того же места.</p></div>
            <Link href={`/miniapp/dialogues/${encodeURIComponent(focus.id)}`} aria-label={`Продолжить: ${focus.title}`}><ArrowRight size={19} /></Link>
          </section>
        ) : null}

        {data.viewer.authenticated ? (
          <>
            <div className={styles["dialogue-tools"]}>
              <label className={styles["search-field"]}>
                <MagnifyingGlass size={18} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти вопрос" aria-label="Поиск по вопросам" />
              </label>
            </div>
            <div className={styles["dialogues-list"]}>
              {visible.slice(focus ? 1 : 0).map((dialogue) => (
                <article key={dialogue.id} className={styles["dialogue-row"]}>
                  <Link className={styles["dialogue-main"]} href={`/miniapp/dialogues/${encodeURIComponent(dialogue.id)}`}>
                    <span className={styles["dialogue-mark"]}><ChatCircleDots size={20} /></span>
                    <span className={styles["dialogue-copy"]}>
                      <span className={styles["dialogue-badges"]}><em>{dialogue.topic}</em><em>{dialogue.status}</em></span>
                      <strong>{dialogue.title}</strong>
                      <small>{dialogue.updated} · {dialogue.messageCount} сообщений</small>
                    </span>
                    <ArrowRight size={18} />
                  </Link>
                </article>
              ))}
            </div>
            {visible.length === 0 ? <section className={styles["empty-state"]}><MagnifyingGlass size={30} /><h2>Ничего не найдено</h2><p>Попробуйте другой запрос.</p><button type="button" onClick={() => setQuery("")}>Сбросить поиск</button></section> : null}
          </>
        ) : (
          <section className={styles["empty-state"]}>
            <ChatCircleDots size={30} />
            <h2>Начните с одного вопроса</h2>
            <p>В Telegram можно открыть Mini App сразу. Email и пароль понадобятся только когда вы захотите сохранить личный диалог.</p>
            <Link href="/miniapp/dialogues/new">Задать вопрос</Link>
            <Link href="/miniapp/account?intent=dialogues">Уже есть аккаунт</Link>
          </section>
        )}

        <Link className={styles["diary-bridge"]} href="/miniapp/diary"><span><small>ГОТОВЫЕ ИТОГИ</small><strong>Все завершённые разборы в Дневнике</strong></span><ArrowRight size={18} /></Link>
      </div>
    </MiniAppChrome>
  );
}
