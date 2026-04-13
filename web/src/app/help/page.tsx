"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { CabinetShell } from "@/components/cabinet/cabinet-shell";
import { PageContainer } from "@/components/ui/page-container";
import { Accordion } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import {
  Rocket,
  Sparkles,
  Calendar,
  CreditCard,
  Video,
  Send,
  Search,
  Mail,
} from "lucide-react";
import Link from "next/link";

interface FAQCategory {
  id: string;
  label: string;
  icon: React.ElementType;
  items: { title: string; content: React.ReactNode }[];
}

const FAQ_CATEGORIES: FAQCategory[] = [
  {
    id: "getting-started",
    label: "Начало работы",
    icon: Rocket,
    items: [
      {
        title: "Как зарегистрироваться?",
        content: (
          <p>
            Нажмите кнопку «Регистрация» на главной странице, укажите email и придумайте пароль.
            Также можно войти через Google, VK или Telegram — для этого нажмите соответствующую кнопку
            на странице входа. После регистрации вы получите доступ ко всем бесплатным сессиям.
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
              <li>Изучить направления в кабинете</li>
              <li>Попробовать бесплатные сессии (3 сессии в месяц)</li>
              <li>Найти практика по подходящему направлению</li>
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
            Быстрые расклады — это AI-инструменты для самостоятельной работы: таро, натальная карта,
            нумерология, гороскопы и рефлексия. Они доступны всем пользователям прямо из кабинета
            и работают мгновенно — без записи к практику.
          </p>
        ),
      },
      {
        title: "Что такое полные расклады?",
        content: (
          <p>
            Полные расклады — это индивидуальные сессии с практиком. Вы записываетесь на удобное время,
            проводите видеосессию и получаете персональную интерпретацию. Полные расклады
            оплачиваются отдельно или входят в подписку.
          </p>
        ),
      },
      {
        title: "Сколько бесплатных сессий доступно?",
        content: (
          <p>
            Каждому пользователю доступно <strong>3 бесплатные сессии в месяц</strong>. Счётчик
            отображается на главной странице кабинета. После исчерпания лимита можно приобрести
            дополнительные сессии в разделе «Баланс и оплата» или записаться к практику.
          </p>
        ),
      },
      {
        title: "Какие направления доступны?",
        content: (
          <p>
            На платформе доступны: Таро, Астрология (натальная карта), Нумерология, Гороскопы,
            Рефлексия и другие направления. Полный список — в разделе
            <Link href="/cabinet/modalities" className="text-primary hover:underline"> «Направления»</Link>
            {" "}в вашем кабинете.
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
            <p className="mb-2">Для записи к практику:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Перейдите в каталог практиков</li>
              <li>Выберите подходящего специалиста</li>
              <li>Откройте его профиль и выберите доступный слот</li>
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
            Отменить бронирование можно в разделе <Link href="/cabinet/bookings" className="text-primary hover:underline">«Мои записи»</Link>.
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
            Пополнить баланс можно в разделе <Link href="/cabinet/billing" className="text-primary hover:underline">«Баланс и оплата»</Link>.
            Доступные способы оплаты: банковская карта, СБП. После оплаты средства зачисляются
            на внутренний баланс и могут быть использованы для оплаты сессий.
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

function SearchFAQs() {
  const [query, setQuery] = useState("");

  const filteredCategories = useMemo(() => {
    if (!query.trim()) return FAQ_CATEGORIES;
    const q = query.toLowerCase();
    return FAQ_CATEGORIES
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            (typeof item.content === "string" && item.content.toLowerCase().includes(q))
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [query]);

  return (
    <div className="space-y-6">
      {/* Search — clean input with icon properly positioned */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Поиск по вопросам..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-10 rounded-xl border-border/40 bg-muted/30 pl-10 pr-4 text-sm transition-colors focus-visible:border-ring focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/20"
        />
      </div>

      {filteredCategories.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/40 bg-muted/10 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Ничего не найдено по запросу «{query}»
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Попробуйте изменить запрос или напишите нам на{" "}
            <a href="mailto:support@eterapy.com" className="text-primary hover:underline">
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
                <Icon className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  {cat.label}
                </h2>
              </div>
              <div className="overflow-hidden rounded-xl border border-border/30 bg-muted/10">
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

  const content = (
    <PageContainer maxWidth="3xl" className="py-12">
      {/* Hero */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Чем мы можем помочь?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ответы на частые вопросы о платформе eTerapy
        </p>
      </div>

      <SearchFAQs />

      {/* Contact support — email only */}
      <div className="mt-12 rounded-xl border border-border/30 bg-muted/10 px-5 py-4 flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Mail className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium">Не нашли ответ?</p>
          <p className="text-xs text-muted-foreground">
            Напишите нам — ответим в течение 24 часов
          </p>
        </div>
        <a
          href="mailto:support@eterapy.com"
          className="ml-auto shrink-0 text-sm font-medium text-primary hover:underline"
        >
          support&#64;eterapy.com
        </a>
      </div>
    </PageContainer>
  );

  if (isLoggedIn) {
    return (
      <CabinetShell role={role} user={session.user}>
        {content}
      </CabinetShell>
    );
  }

  return (
    <div className="min-h-screen">
      {content}
    </div>
  );
}
