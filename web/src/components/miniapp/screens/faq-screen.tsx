"use client";

// B565: «Частые вопросы» — та же база знаний, что на вебовой /help
// (`lib/help-faq-data`), и та же механика: фильтр по категориям + аккордеон с
// одним раскрытым ответом. Разметка своя, потому что здесь нет ни одного
// вебового компонента для переиспользования — на /help это инлайн-JSX страницы.

import { useMemo, useState } from "react";
import Link from "next/link";
import { CaretDown, MagnifyingGlass } from "@phosphor-icons/react";
import { HELP_FAQ_CATS, HELP_FAQS } from "@/lib/help-faq-data";
import { MiniAppChrome, useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { PageHead } from "@/components/miniapp/subpage-ui";
import { miniAppClass, styles } from "@/components/miniapp/styles";

export function FaqScreen() {
  const { data } = useMiniAppV21();
  const [cat, setCat] = useState("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru");
    return HELP_FAQS.filter((item) => {
      if (cat !== "all" && item.cat !== cat) return false;
      if (!needle) return true;
      return `${item.q} ${item.a}`.toLocaleLowerCase("ru").includes(needle);
    });
  }, [cat, query]);

  return (
    <MiniAppChrome data={data}>
      <div className={styles.subpage} data-testid="miniapp-faq-screen">
        <PageHead
          back="/miniapp/profile"
          eyebrow="частые вопросы"
          title="Коротко о главном"
          description="Как устроены разборы, приватность, оплата и встречи со специалистами."
        />

        <label className={styles["search-field"]}>
          <MagnifyingGlass size={18} />
          <input
            value={query}
            onChange={(event) => { setQuery(event.target.value); setOpenId(null); }}
            placeholder="Найти вопрос"
            aria-label="Поиск по частым вопросам"
          />
        </label>

        <div className={styles["filter-row"]} role="tablist" aria-label="Категории вопросов">
          {HELP_FAQ_CATS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={cat === id}
              className={miniAppClass(cat === id && "is-selected")}
              onClick={() => { setCat(id); setOpenId(null); }}
              data-testid={`miniapp-faq-cat-${id}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className={styles["faq-list"]} data-testid="miniapp-faq-list">
          {visible.map((item) => {
            const open = openId === item.id;
            return (
              <article key={item.id} className={miniAppClass("faq-item", open && "is-open")}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : item.id)}
                  aria-expanded={open}
                >
                  <span>{item.q}</span>
                  <CaretDown size={16} />
                </button>
                {open ? <p>{item.a}</p> : null}
              </article>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <section className={styles["empty-state"]}>
            <MagnifyingGlass size={30} />
            <h2>Ничего не найдено</h2>
            <p>Попробуйте другой запрос или напишите нам — разберёмся вместе.</p>
            <Link href="/miniapp/support">Центр поддержки</Link>
          </section>
        ) : null}
      </div>
    </MiniAppChrome>
  );
}
