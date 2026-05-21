"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { CabinetShell } from "@/components/cabinet/cabinet-shell";
import { Accordion } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { appUrl, adminUrl } from "@/lib/subdomain";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import {
  Rocket,
  Sparkles,
  Calendar,
  CreditCard,
  Video,
  Send,
  Search,
  Mail,
  Users,
  Banknote,
  ShieldCheck,
  Settings,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";

interface FAQCategory {
  id: string;
  label: string;
  icon: React.ElementType;
  items: { title: string; content: React.ReactNode }[];
}

const CLIENT_FAQ: FAQCategory[] = [
  {
    id: "getting-started",
    label: "Начало работы",
    icon: Rocket,
    items: [
      {
        title: "Как зарегистрироваться?",
        content: (
          <p>
            Начните с вопроса и первичного ответа. Когда захотите сохранить результат,
            оплатить углубление или записаться к специалисту, ETerapy предложит создать аккаунт.
            Также можно войти через Google, VK или Telegram на странице входа.
          </p>
        ),
      },
      {
        title: "Что делать после регистрации?",
        content: (
          <>
            <p className="mb-2">После регистрации рекомендуем:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Заполнить профиль в разделе «Настройки»</li>
              <li>Задать вопрос и получить первичный ответ</li>
              <li>Сохранить полезные выводы в личном пространстве</li>
              <li>Выбрать углубление, маршрут или специалиста как следующий шаг</li>
            </ul>
          </>
        ),
      },
      {
        title: "Как войти в аккаунт?",
        content: (
          <p>
            Перейдите на страницу <Link href="/login" className="text-primary hover:underline">входа</Link>,
            укажите email и пароль или войдите через Google, VK, Telegram.
            Если забыли пароль — нажмите «Забыли пароль?» и следуйте инструкциям.
          </p>
        ),
      },
    ],
  },
  {
    id: "modalities",
    label: "Направления",
    icon: Sparkles,
    items: [
      {
        title: "Что такое быстрые расклады?",
        content: (
          <p>
            Быстрые сервисы — это входы для самостоятельной работы: первичный ответ,
            4 ракурса, глубокий отчет, разбор переписки, совместимость и маршруты.
            Они начинаются с вопроса и работают без записи к практику.
          </p>
        ),
      },
      {
        title: "Что такое полные расклады?",
        content: (
          <p>
            Полное углубление — это платный продукт или сессия со специалистом после того,
            как ETerapy понял контекст вопроса. Сессия назначается только если живой разговор
            действительно подходит ситуации.
          </p>
        ),
      },
      {
        title: "Что доступно бесплатно?",
        content: (
          <p>
            Первичный ответ доступен бесплатно. Платные продукты, маршруты, подписки и живые
            сессии открываются отдельно и должны показывать понятную стоимость до оплаты.
          </p>
        ),
      },
      {
        title: "Какие направления доступны?",
        content: (
          <p>
            Основной вход — вопрос, но покупать услуги можно напрямую. В кабинете есть раздел
            <Link href={appUrl("/cabinet/products")} className="text-primary hover:underline"> «Продукты»</Link>:
            4 ракурса, глубокий отчет, разбор переписки, совместимость, 7 дней к ясности,
            Таро, натальная карта и числовой портрет.
          </p>
        ),
      },
    ],
  },
  {
    id: "booking",
    label: "Бронирование",
    icon: Calendar,
    items: [
      {
        title: "Как записаться к практику?",
        content: (
          <>
            <p className="mb-2">Для записи к практику в v5:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Задайте вопрос и получите первичный ответ</li>
              <li>Откройте рекомендованный блок специалистов, если он показан</li>
              <li>Выберите специалиста, формат и доступный слот</li>
              <li>Подтвердите бронирование</li>
              <li>Дождитесь подтверждения от практика</li>
            </ol>
          </>
        ),
      },
      {
        title: "Как отменить бронирование?",
        content: (
          <p>
            Отменить бронирование можно в разделе <Link href={appUrl("/cabinet/bookings")} className="text-primary hover:underline">«Мои записи»</Link>.
            Нажмите на бронирование и выберите «Отменить». Обратите внимание: отмена возможна
            не позднее чем за 24 часа до начала сессии. При отмене менее чем за 24 часа
            стоимость сессии может быть удержана.
          </p>
        ),
      },
      {
        title: "Что делать, если практик отменил запись?",
        content: (
          <p>
            Если практик отменил вашу запись, вы получите уведомление на email.
            Стоимость сессии будет возвращена на баланс автоматически.
            Вы можете записаться к другому практику или выбрать другой слот.
          </p>
        ),
      },
    ],
  },
  {
    id: "payment",
    label: "Оплата",
    icon: CreditCard,
    items: [
      {
        title: "Как пополнить баланс?",
        content: (
          <p>
            Пополнить баланс можно в разделе <Link href={appUrl("/cabinet/billing")} className="text-primary hover:underline">«Баланс и оплата»</Link>.
            Доступные способы оплаты: банковская карта, СБП. После оплаты средства зачисляются
            на внутренний баланс и могут быть использованы для оплаты цифровых продуктов и сессий.
          </p>
        ),
      },
      {
        title: "Чем баланс отличается от кредитов ясности?",
        content: (
          <p>
            Рублевый баланс — это деньги на аккаунте: им можно оплатить продукты и живые сессии.
            Кредиты ясности — бонусные баллы для цифровых углублений. Они живут в отдельном разделе
            <Link href={appUrl("/cabinet/credits")} className="text-primary hover:underline"> «Кредиты ясности»</Link>,
            чтобы не смешивать подписку, пополнение и бонусные списания.
          </p>
        ),
      },
      {
        title: "Как оплатить сессию?",
        content: (
          <p>
            При бронировании сессии стоимость списывается с вашего баланса.
            Если баланс недостаточен, вам будет предложено пополнить его.
            Также можно оплатить сессию напрямую через ЮKassa при бронировании.
          </p>
        ),
      },
      {
        title: "Как оформить возврат?",
        content: (
          <p>
            Для оформления возврата обратитесь в поддержку на <Link href="mailto:support@eterapy.com" className="text-primary hover:underline">support&#64;eterapy.com</Link>.
            Возврат возможен в течение 14 дней с момента оплаты при условии,
            что сессия не была проведена.
          </p>
        ),
      },
    ],
  },
  {
    id: "video",
    label: "Видеосессии",
    icon: Video,
    items: [
      {
        title: "Как подключиться к видеосессии?",
        content: (
          <p>
            В назначенное время перейдите в раздел «Мои записи» и нажмите «Подключиться»
            на активной сессии. Откроется страница видеосессии с видео, аудио и чатом.
            Убедитесь, что браузер имеет доступ к камере и микрофону.
          </p>
        ),
      },
      {
        title: "Что делать, если не работает камера или микрофон?",
        content: (
          <>
            <p className="mb-2">Проверьте следующее:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Браузер запросил доступ к камере/микрофону — разрешите его</li>
              <li>В настройках браузера (замочек в адресной строке) проверьте разрешения</li>
              <li>Другие приложения не используют камеру/микрофон</li>
              <li>Попробуйте обновить страницу или перезапустить браузер</li>
            </ul>
          </>
        ),
      },
      {
        title: "Как записать сессию?",
        content: (
          <p>
            Запись сессии доступна практику. Если вы клиент, запись может быть предоставлена
            практиком после сессии. Спросите вашего практика о возможности получения записи.
          </p>
        ),
      },
    ],
  },
  {
    id: "telegram",
    label: "Telegram бот",
    icon: Send,
    items: [
      {
        title: "Как привязать Telegram бот?",
        content: (
          <>
            <p className="mb-2">Для привязки Telegram бота:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Откройте нашего бота в Telegram</li>
              <li>Отправьте команду /start</li>
              <li>Следуйте инструкциям для авторизации</li>
              <li>После привязки вы будете получать уведомления о сессиях</li>
            </ol>
          </>
        ),
      },
      {
        title: "Какие уведомления приходят в Telegram?",
        content: (
          <ul className="list-disc pl-5 space-y-1">
            <li>Подтверждение бронирования</li>
            <li>Напоминание о сессии за 15 минут</li>
            <li>Уведомление о начале сессии</li>
            <li>Результаты AI-раскладов (если включено)</li>
          </ul>
        ),
      },
      {
        title: "Как отключить уведомления в Telegram?",
        content: (
          <p>
            Отключить уведомления можно в разделе «Настройки» вашего кабинета
            или отправив боту команду /settings.
          </p>
        ),
      },
    ],
  },
];

const PRACTITIONER_FAQ: FAQCategory[] = [
  {
    id: "practitioner-start",
    label: "Начало работы",
    icon: Rocket,
    items: [
      {
        title: "Как начать принимать клиентов?",
        content: (
          <>
            <p className="mb-2">После одобрения заявки:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Заполните профиль в разделе <Link href={appUrl("/cabinet/practitioner/profile")} className="text-primary hover:underline">«Мой профиль»</Link></li>
              <li>Настройте расписание и доступные слоты</li>
              <li>Укажите цены по тарифам и длительность сессий</li>
              <li>Клиенты смогут найти вас в каталоге и записаться</li>
            </ol>
          </>
        ),
      },
      {
        title: "Как редактировать профиль?",
        content: (
          <p>
            Перейдите в раздел <Link href={appUrl("/cabinet/practitioner/profile")} className="text-primary hover:underline">«Мой профиль»</Link>.
            Здесь можно менять имя, биографию, фото, направления и тарифы. Изменения видны
            клиентам сразу после сохранения.
          </p>
        ),
      },
    ],
  },
  {
    id: "schedule",
    label: "Расписание",
    icon: Calendar,
    items: [
      {
        title: "Как настроить доступные слоты?",
        content: (
          <p>
            В разделе <Link href={appUrl("/cabinet/practitioner/schedule")} className="text-primary hover:underline">«Расписание»</Link>
            {" "}добавьте интервалы, в которые готовы принимать клиентов. Повторяющиеся правила
            и исключения для конкретных дат настраиваются отдельно.
          </p>
        ),
      },
      {
        title: "Как отменить запись клиента?",
        content: (
          <p>
            Откройте бронирование в разделе «Расписание» и выберите «Отменить». Клиенту
            автоматически вернутся средства и придёт уведомление. Частые отмены влияют
            на рейтинг — старайтесь отменять только по уважительной причине.
          </p>
        ),
      },
    ],
  },
  {
    id: "clients",
    label: "Клиенты",
    icon: Users,
    items: [
      {
        title: "Где посмотреть список клиентов?",
        content: (
          <p>
            В разделе <Link href={appUrl("/cabinet/practitioner/clients")} className="text-primary hover:underline">«Клиенты»</Link>.
            Для каждого клиента доступна история сессий, заметки и статус оплаты.
          </p>
        ),
      },
      {
        title: "Как отвечать на отзывы?",
        content: (
          <p>
            Перейдите в <Link href={appUrl("/cabinet/practitioner/reviews")} className="text-primary hover:underline">«Отзывы»</Link>
            {" "}и оставьте публичный ответ. Клиент получит уведомление.
          </p>
        ),
      },
    ],
  },
  {
    id: "earnings",
    label: "Выплаты",
    icon: Banknote,
    items: [
      {
        title: "Когда приходят выплаты?",
        content: (
          <p>
            Выплаты производятся два раза в месяц: <strong>1-го</strong> и <strong>15-го</strong> числа.
            Комиссия платформы удерживается автоматически и отображается в разделе
            <Link href={appUrl("/cabinet/practitioner/earnings")} className="text-primary hover:underline"> «Выплаты»</Link>.
          </p>
        ),
      },
      {
        title: "Что влияет на сумму выплаты?",
        content: (
          <ul className="list-disc pl-5 space-y-1">
            <li>Проведённые сессии за период</li>
            <li>Комиссия платформы (индивидуальный процент)</li>
            <li>Удержания по жалобам, если они были удовлетворены</li>
            <li>Возвраты клиентам по отменам</li>
          </ul>
        ),
      },
    ],
  },
  {
    id: "video-practitioner",
    label: "Видеосессии",
    icon: Video,
    items: [
      {
        title: "Как начать сессию?",
        content: (
          <p>
            За 5 минут до начала в расписании появится кнопка «Начать». Откроется страница
            видеосессии с клиентом: видео, аудио, чат, заметки. По завершению нажмите
            «Завершить сессию», чтобы запустить расчёт выплаты.
          </p>
        ),
      },
      {
        title: "Что делать, если клиент не подключился?",
        content: (
          <p>
            Подождите 10 минут. Если клиент не вышел на связь, можно завершить сессию
            с пометкой «неявка клиента» — сессия будет оплачена согласно правилам платформы.
          </p>
        ),
      },
    ],
  },
];

const ADMIN_FAQ: FAQCategory[] = [
  {
    id: "admin-start",
    label: "Быстрый старт",
    icon: Rocket,
    items: [
      {
        title: "Разделы админ-панели",
        content: (
          <ul className="list-disc pl-5 space-y-1">
            <li><Link href={adminUrl("/admin/clients")} className="text-primary hover:underline">Клиенты</Link> — управление пользователями</li>
            <li><Link href={adminUrl("/admin/practitioners")} className="text-primary hover:underline">Практики</Link> — модерация, тарифы, комиссия</li>
            <li><Link href={adminUrl("/admin/applications")} className="text-primary hover:underline">Заявки</Link> — обработка анкет</li>
            <li><Link href={adminUrl("/admin/complaints")} className="text-primary hover:underline">Жалобы</Link> — разрешение споров</li>
            <li><Link href={adminUrl("/admin/payments")} className="text-primary hover:underline">Платежи</Link> — транзакции и выплаты</li>
          </ul>
        ),
      },
    ],
  },
  {
    id: "users-admin",
    label: "Управление пользователями",
    icon: Users,
    items: [
      {
        title: "Как заблокировать клиента?",
        content: (
          <p>
            В разделе «Клиенты» откройте карточку, нажмите «Заблокировать» и укажите причину.
            Клиент потеряет доступ к кабинету, но данные и история сохранятся.
          </p>
        ),
      },
      {
        title: "Как удалить аккаунт?",
        content: (
          <p>
            Удаление клиента выполняется с <strong>10-дневным льготным периодом</strong>.
            Ежедневный крон в 00:00 (MSK) удаляет аккаунты, по которым истёк срок. До этого момента
            удаление можно отменить.
          </p>
        ),
      },
      {
        title: "Как войти под пользователем (импersonate)?",
        content: (
          <p>
            На карточке клиента/практика нажмите «Войти как». Сессия суперадмина сохранится,
            а вы войдёте в кабинет пользователя на поддомене. Чтобы вернуться — нажмите «Выйти из режима».
          </p>
        ),
      },
    ],
  },
  {
    id: "complaints-admin",
    label: "Жалобы и модерация",
    icon: AlertTriangle,
    items: [
      {
        title: "Как рассматривать жалобу?",
        content: (
          <p>
            В <Link href={adminUrl("/admin/complaints")} className="text-primary hover:underline">«Жалобах»</Link>
            {" "}откройте обращение. Внутри доступны: видеозапись сессии, транскрипция, файлы, чат.
            Решение об удовлетворении/отклонении влияет на выплату практику.
          </p>
        ),
      },
      {
        title: "Когда удерживается выплата практику?",
        content: (
          <p>
            Если жалоба подана <strong>во время</strong> сессии — выплата приостанавливается
            до решения модератора. Жалобы после сессии не удерживают уже выплаченные суммы.
          </p>
        ),
      },
    ],
  },
  {
    id: "system-admin",
    label: "Системные задачи",
    icon: Settings,
    items: [
      {
        title: "Где смотреть логи и статус сервисов?",
        content: (
          <p>
            Раздел <Link href={adminUrl("/admin/system")} className="text-primary hover:underline">«Система»</Link>
            {" "}показывает здоровье контейнеров и даёт доступ к логам приложения.
          </p>
        ),
      },
      {
        title: "Где настроить AI-модели?",
        content: (
          <p>
            В разделе «Система» → «AI-модели» настраиваются провайдеры и параметры моделей
            для направлений, транскрипции и других ML-функций.
          </p>
        ),
      },
    ],
  },
  {
    id: "security-admin",
    label: "Безопасность",
    icon: ShieldCheck,
    items: [
      {
        title: "Как сбросить пароль пользователю?",
        content: (
          <p>
            На карточке пользователя нажмите «Сбросить пароль» — на email отправится ссылка
            для установки нового пароля.
          </p>
        ),
      },
    ],
  },
];

function getFaqForRole(role: string): FAQCategory[] {
  if (role === "PRACTITIONER") return PRACTITIONER_FAQ;
  if (role === "ADMIN" || role === "SUPERADMIN" || role === "MODERATOR") return ADMIN_FAQ;
  return CLIENT_FAQ;
}

function SearchFAQs({ categories }: { categories: FAQCategory[] }) {
  const [query, setQuery] = useState("");

  const filteredCategories = useMemo(() => {
    if (!query.trim()) return categories;
    const q = query.toLowerCase();
    return categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            (typeof item.content === "string" && item.content.toLowerCase().includes(q))
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [query, categories]);

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--soft-ink-faint)]" />
        <Input
          type="search"
          placeholder="Поиск по вопросам..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="soft-question-input h-11 py-2 pl-11 pr-4 text-sm"
        />
      </div>

      {filteredCategories.length === 0 ? (
        <div className="soft-card-flat py-8 text-center">
          <p className="text-sm text-[var(--soft-ink-soft)]">
            Ничего не найдено по запросу «{query}»
          </p>
          <p className="mt-1 text-xs text-[var(--soft-ink-faint)]">
            Напишите нам на{" "}
            <a href="mailto:support@eterapy.com" className="font-semibold text-[var(--soft-bordeaux)] hover:underline">
              support&#64;eterapy.com
            </a>
          </p>
        </div>
      ) : (
        filteredCategories.map((cat) => {
          const Icon = cat.icon;
          return (
            <section key={cat.id} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Icon className="h-4 w-4 text-[var(--soft-terracotta-dark)]" />
                <h2 className="font-heading text-sm font-semibold text-[var(--soft-bordeaux)]">
                  {cat.label}
                </h2>
              </div>
              <div className="soft-card overflow-hidden p-0">
                <Accordion items={cat.items} />
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

export default function HelpPage() {
  const { data: session } = useSession();
  const isLoggedIn = !!session;
  const role = session?.user?.role ?? "CLIENT";
  const categories = getFaqForRole(role);

  const roleLabel =
    role === "PRACTITIONER"
      ? "Ответы для практиков"
      : role === "ADMIN" || role === "SUPERADMIN" || role === "MODERATOR"
      ? "Ответы для администраторов"
      : "Ответы на частые вопросы о платформе ETerapy";

  const content = (
    <>
      <PublicJsonLd route="/help" />
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6" data-testid="help-page-v42">
        <section className="soft-card p-5 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="soft-eyebrow">помощь</p>
              <h1 className="soft-h1 mt-2">Чем мы можем помочь?</h1>
              <p className="soft-lede mt-3 max-w-3xl">{roleLabel}</p>
            </div>
            <Link href={appUrl("/cabinet/products")} className="soft-button soft-button-primary">
              Продукты и услуги
            </Link>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {[
              ["Диалог ясности", "первичный ответ, уточнения, сохранение"],
              ["Оплата", "баланс, кредиты, подписка и возвраты"],
              ["Живые сессии", "запись, видео, жалобы и поддержка"],
            ].map(([title, text]) => (
              <div key={title} className="soft-card-flat p-4">
                <p className="font-heading text-lg font-semibold text-[var(--soft-bordeaux)]">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <SearchFAQs categories={categories} />
        </section>

        <div className="soft-card mt-8 flex flex-wrap items-center gap-4 p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--soft-apricot)]">
            <Mail className="h-5 w-5 text-[var(--soft-bordeaux)]" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--soft-ink)]">Не нашли ответ?</p>
            <p className="text-xs text-[var(--soft-ink-faint)]">
              Напишите нам: поможем с оплатой, записью, продуктами, жалобами и настройками уведомлений.
            </p>
          </div>
          <a
            href="mailto:support@eterapy.com"
            className="ml-auto shrink-0 text-sm font-semibold text-[var(--soft-bordeaux)] hover:underline"
          >
            support&#64;eterapy.com
          </a>
        </div>
      </main>
    </>
  );

  if (isLoggedIn) {
    return (
      <CabinetShell role={role} user={session.user}>
        {content}
      </CabinetShell>
    );
  }

  return (
    <div className="soft-clarity-page min-h-screen">
      {content}
    </div>
  );
}
