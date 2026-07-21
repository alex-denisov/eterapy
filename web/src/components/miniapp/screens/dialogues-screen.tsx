"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChatCircleDots, MagnifyingGlass, Plus, Trash } from "@phosphor-icons/react";
import { MiniAppChrome, useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { MiniAppDiaryPinGate } from "@/components/miniapp/diary-pin";
import { styles } from "@/components/miniapp/styles";

function messagesLabel(value: number) {
  const mod100 = value % 100;
  const mod10 = value % 10;
  const word = mod100 >= 11 && mod100 <= 14 ? "сообщений" : mod10 === 1 ? "сообщение" : mod10 >= 2 && mod10 <= 4 ? "сообщения" : "сообщений";
  return `${value} ${word}`;
}

export function DialoguesScreen() {
  const { data } = useMiniAppV21();
  const [query, setQuery] = useState("");
  // B554 п.26: в вебе вопрос можно удалить (/cabinet/questions), в мини-аппе
  // удаления не было нигде. Эндпоинт уже есть — DELETE /api/dialogues/[id],
  // тот же мягкий delete (status DELETED + deletedAt), что и у веба.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function remove(id: string) {
    setDeleting(id);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/dialogues/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) {
        setDeleteError(response.status === 401
          ? "Сессия истекла. Войдите в аккаунт и попробуйте ещё раз."
          : "Не удалось удалить вопрос. Попробуйте ещё раз.");
        return;
      }
      setRemoved((current) => [...current, id]);
      setConfirming(null);
    } catch {
      setDeleteError("Нет связи с сервером. Попробуйте ещё раз.");
    } finally {
      setDeleting(null);
    }
  }

  const visible = useMemo(() => {
    const value = query.trim().toLocaleLowerCase("ru");
    const list = data.dialogues.filter((item) => !removed.includes(item.id));
    return value ? list.filter((item) => item.title.toLocaleLowerCase("ru").includes(value)) : list;
  }, [data.dialogues, query, removed]);
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

        {/* B564 п.2 (owner 2026-07-21): «если дневник закрыт пин-кодом, то в
            списке диалогов тоже нужно скрывать список предыдущих диалогов и
            оставлять такой же фрейм для открытия». Это та же приватная
            переписка — гейт берём тот же, что в Дневнике. Заголовок экрана и
            кнопка нового вопроса остаются: закрытый Дневник не должен мешать
            задать вопрос. */}
        {data.viewer.authenticated ? (
          <MiniAppDiaryPinGate
            title="Диалоги закрыты PIN-кодом"
            action="Открыть диалоги"
            testId="miniapp-dialogues-pin-lock"
          >
            {focus ? (
              <section className={styles["dialogue-focus"]}>
                <div><span>ПРОДОЛЖИТЬ</span><strong>{focus.title}</strong><p>Вернитесь к последнему уточнению и продолжите с того же места.</p></div>
                <Link href={`/miniapp/dialogues/${encodeURIComponent(focus.id)}`} aria-label={`Продолжить: ${focus.title}`}><ArrowRight size={19} /></Link>
              </section>
            ) : null}

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
                      <small>{dialogue.updated} · {messagesLabel(dialogue.messageCount)}</small>
                    </span>
                    <ArrowRight size={18} />
                  </Link>
                  {/* Удаление — в два шага: случайное касание не должно стирать
                      переписку, которую человек вёл несколько дней. */}
                  {confirming === dialogue.id ? (
                    <div className={styles["dialogue-confirm"]}>
                      <span>Удалить вопрос? Восстановить не получится.</span>
                      <div>
                        <button type="button" onClick={() => setConfirming(null)} disabled={deleting === dialogue.id}>Отмена</button>
                        <button type="button" className={styles["is-danger"]} onClick={() => void remove(dialogue.id)} disabled={deleting === dialogue.id}>
                          {deleting === dialogue.id ? "Удаляем…" : "Удалить"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={styles["dialogue-delete"]}
                      aria-label={`Удалить вопрос: ${dialogue.title}`}
                      onClick={() => { setConfirming(dialogue.id); setDeleteError(null); }}
                    >
                      <Trash size={17} />
                    </button>
                  )}
                </article>
              ))}
            </div>
            {deleteError ? <p className={styles["form-error"]} role="alert">{deleteError}</p> : null}
            {visible.length === 0 ? <section className={styles["empty-state"]}><MagnifyingGlass size={30} /><h2>Ничего не найдено</h2><p>Попробуйте другой запрос.</p><button type="button" onClick={() => setQuery("")}>Сбросить поиск</button></section> : null}
          </MiniAppDiaryPinGate>
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
