"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { appUrl } from "@/lib/subdomain";

interface FaqItem {
  id: string;
  cat: string;
  q: string;
  a: string;
}

const CATS: [string, string][] = [
  ["all", "Все"],
  ["product", "Продукт"],
  ["privacy", "Приватность"],
  ["payments", "Оплата и возврат"],
  ["specialists", "Специалисты"],
  ["esoteric", "Эзотерические форматы"],
  ["safety", "Safety"],
  ["practitioner", "Для специалистов"],
];

const FAQS: FaqItem[] = [
  { id: "p1", cat: "product", q: "Это терапия?", a: "Нет. ETerapy — диалоговая платформа ясности. Помогаем сформулировать вопрос, увидеть его с разных сторон и выбрать следующий безопасный шаг. Терапия — это длинная работа со специалистом; на платформе вы можете записаться к нему, если захотите. Мы не ставим диагнозов и не заменяем психолога, врача или юриста." },
  { id: "p2", cat: "product", q: "Как устроен Диалог ясности?", a: "Вы пишете вопрос своими словами → мы задаём 2–4 уточняющих, любой можно пропустить → получаете первичный разбор: что мы услышали, главная развилка, что обратило внимание, безопасный шаг. Дальше — выбор углубления: ракурсы, разбор переписки, совместимость, маршрут или встреча со специалистом." },
  { id: "p3", cat: "product", q: "Сколько времени это занимает?", a: "Первичный разбор — 5–7 минут. 4 ракурса — 10–15 минут чтения. Разбор переписки или совместимость — около 20. Маршрут «7 дней» — по 5–10 минут в день. Встреча со специалистом — 60 минут." },
  { id: "p4", cat: "product", q: "Можно ли пользоваться анонимно?", a: "Да. Начните с вопроса и первичного ответа — первый разбор не требует регистрации. Если хотите сохранить историю и карту, потребуется аккаунт; имя можно не указывать, подойдёт псевдоним." },
  { id: "p5", cat: "product", q: "Что такое «Моя карта»?", a: "Личное пространство, где накапливаются темы, выводы и инсайты из ваших разборов. Карта выявляет повторяющиеся темы, связи и зоны внимания — без давления и диагнозов. Доступна с планом Plus или выше." },

  { id: "pr1", cat: "privacy", q: "Кто видит мои разборы?", a: "Только вы. Содержимое разборов шифруется и недоступно сотрудникам платформы. Специалист видит ваш запрос только если вы записались к нему и согласились передать summary предразбора." },
  { id: "pr2", cat: "privacy", q: "Что попадает в библиотеку вопросов?", a: "Ничего без вашего согласия. Если вы разрешаете публикацию, мы автоматически удаляем имена, телефоны, города, имена близких и любые личные данные. Модератор проверяет вручную перед публикацией. Удалить можно в один клик." },
  { id: "pr3", cat: "privacy", q: "Как удалить аккаунт и все данные?", a: "В кабинете → Настройки → «Удалить аккаунт». Все разборы, инсайты, история и заметки удаляются необратимо в течение 30 дней (требование закона хранить минимальный журнал безопасности). После 30 дней — ничего не остаётся." },
  { id: "pr4", cat: "privacy", q: "Используете ли вы мои разборы для обучения AI?", a: "Нет. Содержимое ваших разборов используется только для вашей же карты — чтобы видеть темы и связи. Языковая модель получает запрос анонимизированно: имена, адреса, телефоны вырезаются. Общие модели на ваших данных не обучаются." },

  { id: "pay1", cat: "payments", q: "Как работает эскроу при встречах?", a: "Деньги списываются в эскроу при бронировании. Специалист получает оплату через 48 часов после встречи. До этого момента отмена и возврат — бесплатны. Если вы подали жалобу — деньги замораживаются до решения модератора." },
  { id: "pay2", cat: "payments", q: "Можно платить международной картой?", a: "Да. ЮKassa — для RU/BY/KZ-карт, СБП по QR — без комиссии, Stripe — для международных карт в EUR/USD." },
  { id: "pay3", cat: "payments", q: "Чем отличается Plus от бесплатного?", a: "Бесплатный: первичный разбор, библиотека, базовое использование. Plus 490 ₽/мес: безлимитные разборы и уточнения, все цифровые углубления (4 ракурса, разбор переписки, совместимость), Моя карта с историей и темами, маршрут «7 дней», приоритетный показ слотов специалистов. Встречи со специалистами оплачиваются отдельно по полной ставке." },
  { id: "pay4", cat: "payments", q: "Что такое кредиты ясности и как их использовать?", a: "Это внутренняя валюта за значимые действия (практика, миссии, рефералы). Можно тратить только на цифровые форматы: ракурсы, разборы, углубления, маршруты. На встречи со специалистами кредиты не применяются — работа живых людей идёт по полной ставке. Кредиты не выводятся деньгами, действуют 6 месяцев." },
  { id: "pay5", cat: "payments", q: "Как получить возврат?", a: "Если встреча не состоялась по вине специалиста или нарушен этический кодекс — возврат происходит автоматически после решения модератора. Если хотите отменить заранее — за 24 часа до встречи деньги возвращаются без вопросов." },
  { id: "pay6", cat: "payments", q: "Как пополнить баланс?", a: "В кабинете → Подписка и оплата → «Пополнить». Поддерживаются банковские карты (ЮKassa), СБП и международные карты (Stripe). Баланс можно тратить на любые цифровые продукты." },

  { id: "s1", cat: "specialists", q: "Как вы отбираете специалистов?", a: "Проверка диплома, дополнительных сертификатов и часов практики. Документальное подтверждение регулярной супервизии. Видео-знакомство с куратором. Подписание этического кодекса. Испытательный период первых 5 встреч под наблюдением. Без супервизии — не работают." },
  { id: "s2", cat: "specialists", q: "Что делать, если специалист повёл себя неправильно?", a: "Кнопка «Сообщить о нарушении» в карточке встречи. Жалоба идёт модератору, не специалисту. До решения деньги остаются в эскроу. Если нарушение подтвердится — возврат + санкции к специалисту (от предупреждения до удаления профиля)." },
  { id: "s3", cat: "specialists", q: "Можно записаться к этому же специалисту повторно?", a: "Да. Для записи к практику в v5 перейдите в кабинет → «Записи» — там появится кнопка повторного бронирования с теми же датами и форматом. Можно купить пакет из 5 встреч по той же ставке." },
  { id: "s4", cat: "specialists", q: "Как подключить предразбор перед сессией?", a: "При бронировании вы можете передать специалисту summary вашего предразбора — он получит контекст заранее и сможет подготовиться. Это экономит время на старте. Вы контролируете, что именно передаётся." },

  { id: "e1", cat: "esoteric", q: "Это серьёзная астрология или поверхностные обобщения?", a: "Базовая натальная карта (Солнце, Луна, Меркурий, Венера, Марс, доминирующие дома) рассчитывается классическим методом по западной школе. Разбор пишет астролог-практик ETerapy — не AI. Мы не предсказываем будущее как факт и не пишем «вам нельзя жениться в этом году». Это символический язык." },
  { id: "e2", cat: "esoteric", q: "Что такое «Эзотерик + психотерапевт» — и зачем оно?", a: "Уникальный формат: 60 минут, 30 первых — эзотерический разбор (Таро / натальная карта / числа по выбору), 30 следующих — психотерапевтический. Эзотерик предлагает символический язык, психотерапевт удерживает реальность и безопасный шаг. Чтобы метафора не уносила, а помогала." },
  { id: "e3", cat: "esoteric", q: "Если я не верю в Таро, имеет ли смысл расклад?", a: "Часто да. Карты — это не оракул, а вопросный язык. Иногда увидеть свой запрос через образ проще, чем через анализ. Если в процессе вы поняли, что вам не подходит — можно вернуться к диалогу ясности или психологу." },

  { id: "sf1", cat: "safety", q: "Что если у меня сейчас очень тяжело?", a: "ETerapy — не для острых кризисов. Если есть мысли о самоповреждении, насилии или есть угроза жизни:\n\n• 8-800-2000-122 — бесплатная психологическая помощь, круглосуточно\n• 112 — экстренные службы\n\nМы сразу переключаем сценарий на экстренную поддержку при признаках кризиса в разборе." },
  { id: "sf2", cat: "safety", q: "Вы блокируете «тёмные» темы в диалоге?", a: "Мы не блокируем тему — мы перенаправляем. Если в разборе появляются признаки кризиса, самоповреждения, насилия, медицинских рисков, юридических угроз — обычный сценарий приостанавливается, и появляются контакты профильной помощи. Это не цензура, это бережность." },

  { id: "pt1", cat: "practitioner", q: "Сколько вы удерживаете с консультаций?", a: "15–25% в зависимости от категории: 20% — для классических встреч, 25% — для совместных сессий с привлечённым партнёром, 15% — для пакетов от 5 встреч. Сюда уже входит эквайринг, эскроу-удержание, защита через жалобы, AI-резюме после встречи, маркетинг." },
  { id: "pt2", cat: "practitioner", q: "Когда я получаю выплату?", a: "Каждый вторник за встречи прошлой недели. На счёт ИП или самозанятого. Минимальный порог — 3 000 ₽; если ниже — переносится на следующий вторник." },
  { id: "pt3", cat: "practitioner", q: "Можно работать только с своими клиентами без рекламы платформы?", a: "Да. У каждого специалиста есть личная ссылка предразбора eterapy.com/p/{slug}/precheck — её можно размещать в соцсетях. Клиент, пришедший по ссылке, считается «вашим»: с него удерживается сниженная комиссия 10–12% (вместо 20%)." },
  { id: "pt4", cat: "practitioner", q: "Как работает видеосессия?", a: "Зашифрованный видеозвонок открывается за 15 минут до встречи в кабинете специалиста и клиента. Не нужно скачивать ничего дополнительно. Запись сессии ведётся только по согласию обеих сторон и доступна только им." },
];

function FaqCard({ item, catLabel }: { item: FaqItem; catLabel: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="soft-card overflow-hidden"
      style={{ padding: 0, cursor: "pointer" }}
      onClick={() => setOpen(!open)}
    >
      <div className="flex items-center justify-between gap-4 px-5 py-5">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span
            className="soft-chip shrink-0 self-start text-[10px]"
            style={{ padding: "2px 8px" }}
            onClick={(e) => e.stopPropagation()}
          >
            {catLabel}
          </span>
          <span
            className="font-heading text-base font-medium leading-snug sm:text-[1.05rem]"
            style={{ color: "var(--soft-bordeaux)" }}
          >
            {item.q}
          </span>
        </div>
        <span
          className="shrink-0 text-2xl font-light transition-transform duration-200"
          style={{
            color: "var(--soft-terracotta-dark)",
            transform: open ? "rotate(45deg)" : "none",
            fontWeight: 300,
            lineHeight: 1,
          }}
          aria-hidden="true"
        >
          +
        </span>
      </div>
      {open && (
        <div className="px-5 pb-5 pt-0">
          <p
            className="text-sm leading-relaxed"
            style={{
              color: "var(--soft-ink-soft)",
              whiteSpace: "pre-wrap",
              borderTop: "1px solid var(--soft-paper-edge)",
              paddingTop: "1rem",
            }}
          >
            {item.a}
          </p>
        </div>
      )}
    </div>
  );
}

function HelpContent() {
  const [cat, setCat] = useState("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return FAQS.filter(
      (f) =>
        (cat === "all" || f.cat === cat) &&
        (!q || f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)),
    );
  }, [cat, query]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6" data-testid="help-page-v42">

      {/* Hero */}
      <div className="mb-8 text-center">
        <p className="soft-eyebrow mb-3">помощь и FAQ</p>
        <h1 className="font-heading text-4xl font-semibold leading-tight sm:text-5xl" style={{ color: "var(--soft-bordeaux)" }}>
          Что бы вы <span className="italic">хотели узнать?</span>
        </h1>
      </div>

      {/* Search */}
      <div className="soft-card mb-6 flex items-center gap-3 px-4 py-3.5">
        <span style={{ color: "var(--soft-ink-faint)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3c0 0-2 3-2 6 0 2.2 1 4 2 5M12 3c0 0 2 3 2 6 0 2.2-1 4-2 5M12 3v8M8 21l4-4 4 4"/>
          </svg>
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Спросите своими словами — например, «как удалить аккаунт»"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--soft-ink-faint)]"
          style={{ fontSize: "0.9375rem", color: "var(--soft-ink)" }}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="soft-chip text-[11px]"
            style={{ padding: "2px 8px" }}
          >
            ×
          </button>
        )}
      </div>

      {/* Category chips */}
      <div className="mb-6 flex flex-wrap justify-center gap-2">
        {CATS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setCat(id)}
            className={`soft-chip text-xs transition-colors ${cat === id ? "soft-chip-warm" : ""}`}
            style={{ padding: "5px 12px" }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Crisis banner */}
      <div
        className="soft-card mb-6 flex flex-wrap items-center gap-4 px-5 py-5"
        style={{ background: "linear-gradient(140deg, #5C2A2C, #2A1411)", border: "none" }}
      >
        <div className="flex-1" style={{ minWidth: 220 }}>
          <p className="font-heading text-lg font-medium" style={{ color: "#FBF0E1" }}>
            Если сейчас очень тяжело
          </p>
          <p className="mt-1 text-sm" style={{ color: "#E8C4B8" }}>
            ETerapy не для острых кризисов. Позвоните:
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="tel:88002000122"
            className="soft-chip font-bold"
            style={{ background: "#F4D9C1", color: "var(--soft-bordeaux)", fontSize: 13 }}
            onClick={(e) => e.stopPropagation()}
          >
            📞 8-800-2000-122
          </a>
          <a
            href="tel:112"
            className="soft-chip font-bold"
            style={{ background: "#F4D9C1", color: "var(--soft-bordeaux)", fontSize: 13 }}
            onClick={(e) => e.stopPropagation()}
          >
            112
          </a>
        </div>
      </div>

      {/* FAQ items */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="soft-card py-12 text-center">
            <p className="font-heading text-xl italic" style={{ color: "var(--soft-ink-soft)" }}>
              Не нашли ответ?
            </p>
            <p className="mt-3 text-sm" style={{ color: "var(--soft-ink-faint)" }}>
              Напишите нам — отвечаем за 4 часа в будни.
            </p>
            <a
              href="mailto:support@eterapy.com"
              className="soft-button soft-button-primary mt-5 inline-flex"
            >
              Написать в поддержку
            </a>
          </div>
        ) : (
          filtered.map((item) => (
            <FaqCard
              key={item.id}
              item={item}
              catLabel={CATS.find(([id]) => id === item.cat)?.[1] ?? item.cat}
            />
          ))
        )}
      </div>

      {/* Contact channels */}
      <div className="mt-12 text-center">
        <h2 className="font-heading text-2xl font-semibold" style={{ color: "var(--soft-bordeaux)" }}>
          Если ответа нет — <span className="italic">напишите нам</span>
        </h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            {
              label: "Telegram",
              value: "@eterapy_support",
              desc: "Самый быстрый канал",
              bg: "linear-gradient(140deg, #DBD3EA, #E8E1F2)",
              color: "#4A3E5E",
              href: "https://t.me/eterapy_support",
            },
            {
              label: "Email",
              value: "support@eterapy.com",
              desc: "Для деталей и документов",
              bg: "linear-gradient(140deg, #F4D9C1, #F8E6D1)",
              color: "var(--soft-bordeaux)",
              href: "mailto:support@eterapy.com",
            },
            {
              label: "Анонимно",
              value: "форма без email",
              desc: "Для чувствительных тем",
              bg: "linear-gradient(140deg, #D6DECC, #E5EBDC)",
              color: "#3A4A36",
              href: appUrl("/settings"),
            },
          ].map((ch) => (
            <a
              key={ch.label}
              href={ch.href}
              className="soft-card-flat block p-5 text-left transition-opacity hover:opacity-90"
              style={{ background: ch.bg, color: ch.color, border: "none" }}
            >
              <p className="font-heading text-sm font-semibold">{ch.label}</p>
              <p className="mt-1 text-base font-medium">{ch.value}</p>
              <p className="mt-1 text-xs opacity-70">{ch.desc}</p>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}

export default function HelpPage() {
  const { data: session } = useSession();
  // /help on eterapy.com is the public knowledge base, regardless of
  // auth state. The cabinet's own support entry point (tickets +
  // contacts) lives at app.eterapy.com/support and is a separate page.
  void session;
  return (
    <div className="soft-clarity-page min-h-screen">
      <HelpContent />
    </div>
  );
}
