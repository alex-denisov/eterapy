"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bell,
  CalendarBlank,
  CrownSimple,
  FileText,
  Gift,
  IdentificationCard,
  Lifebuoy,
  Lock,
  ShareNetwork,
  ShieldCheck,
  SignIn,
  SignOut,
  User,
  UserPlus,
  Wallet,
  type Icon,
} from "@phosphor-icons/react";
import { MiniAppChrome, useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { styles } from "@/components/miniapp/styles";

const HUB_ROWS: Array<{ href: string; Icon: Icon; title: string; subtitle: string; meta?: string }> = [
  { href: "/miniapp/profile/bookings", Icon: CalendarBlank, title: "Записи", subtitle: "Будущие и завершённые встречи" },
  { href: "/miniapp/profile/materials", Icon: FileText, title: "Материалы специалиста", subtitle: "Задания и файлы после встречи" },
  { href: "/miniapp/profile/wallet", Icon: Wallet, title: "Кошелёк", subtitle: "Баллы, пакеты и история" },
  { href: "/miniapp/profile/invites", Icon: UserPlus, title: "Приглашения", subtitle: "Подарки и приглашённые друзья" },
];

const SETTINGS_ROWS: Array<{ href: string; Icon: Icon; title: string; subtitle: string }> = [
  { href: "/miniapp/profile/about", Icon: IdentificationCard, title: "О себе", subtitle: "Дата рождения, цели и темы" },
  // owner B554: «Email, пароль и связанные приложения» не помещалось в строку
  // (обрезка 8px). Подпись наша, поэтому короче — смысл тот же.
  { href: "/miniapp/profile/security", Icon: Lock, title: "Безопасность", subtitle: "Email, пароль и вход" },
  { href: "/miniapp/profile/notifications", Icon: Bell, title: "Уведомления", subtitle: "Telegram и напоминания" },
  { href: "/miniapp/profile/data", Icon: ShieldCheck, title: "Данные и удаление", subtitle: "Экспорт и управление аккаунтом" },
];

function ProfileRow({ href, Icon: RowIcon, title, subtitle, meta }: {
  href: string;
  Icon: Icon;
  title: string;
  subtitle: string;
  meta?: string;
}) {
  return (
    <article className={styles["profile-row"]}>
      <Link href={href}>
        <span className={styles["profile-row-icon"]}><RowIcon size={20} /></span>
        <span><strong>{title}</strong><small>{subtitle}</small></span>
        <span className={styles["profile-row-trailing"]}>
          {meta ? <em>{meta}</em> : null}
          <ArrowRight className={styles["profile-row-caret"]} size={18} />
        </span>
      </Link>
    </article>
  );
}

export function ProfileScreen() {
  const { data, viewerName, share } = useMiniAppV21();
  const viewer = data.viewer;
  const bookingMeta = data.loadError ? "—" : data.upcomingBookingLabel ? "1" : undefined;

  return (
    <MiniAppChrome data={data}>
      <div className={styles["profile-screen"]} data-screen="profile" data-testid="miniapp-profile-screen">
        <section className={styles["page-heading"]}>
          <div className={styles["page-heading-copy"]}><p className={styles.eyebrow}>аккаунт</p><h1>Профиль</h1><p className={styles["page-description"]}>Данные, записи и способы оставаться на связи.</p></div>
        </section>

        <section className={styles["profile-card"]}>
          <span className={styles["profile-avatar"]}><User size={29} weight="fill" /></span>
          {/* B554 (owner п.4/п.7): имя + «, пока без аккаунта» не помещалось в
              строку, а подпись обрезалась многоточием. Тариф из подписи убран —
              он и так стоит отдельной карточкой прямо под этим блоком. */}
          <span><strong>{viewerName}</strong><small>{viewer.authenticated ? (viewer.email ?? "Аккаунт подключён") : "Пока без аккаунта"}</small></span>
          <Link href={viewer.authenticated ? "/miniapp/profile/about" : "/miniapp/account?intent=profile"}>{viewer.authenticated ? "Изменить" : "Сохранить"}</Link>
        </section>

        <section className={styles["plan-card"]} aria-label={viewer.authenticated ? "Текущий тариф" : "Сохранение разборов"}>
          <span className={styles["plan-icon"]}><CrownSimple size={21} weight="duotone" /></span>
          {viewer.authenticated && data.loadError ? (
            <><div><small>ТЕКУЩИЙ ТАРИФ</small><strong>Не удалось загрузить</strong><p>Обновите экран. Мы не подставляем базовый тариф вместо неизвестного.</p></div><button type="button" onClick={() => window.location.reload()}>Повторить</button></>
          ) : viewer.authenticated ? (
            <><div><small>ТЕКУЩИЙ ТАРИФ</small><strong>{viewer.plan}</strong><p>{viewer.planStatus}. Условия видны до любого изменения.</p></div><Link href="/miniapp/packages">Изменить <ArrowRight size={15} /></Link></>
          ) : (
            <><div><small>СОХРАНЯЙТЕ РЕЗУЛЬТАТЫ</small><strong>Создайте профиль</strong><p>Разборы появятся в Дневнике и будут доступны с сайта.</p></div><Link href="/miniapp/account?mode=register&intent=profile">Создать <ArrowRight size={15} /></Link></>
          )}
        </section>

        {!viewer.authenticated ? (
          <section className={styles["profile-section"]}>
            <p className={styles.eyebrow}>сохранить личное пространство</p>
            <div className={styles["profile-rows"]}>
              <ProfileRow href="/miniapp/account?mode=register&intent=profile" Icon={UserPlus} title="Добавить email и пароль" subtitle="Один раз, чтобы входить и с сайта" />
              <ProfileRow href="/miniapp/account?mode=login&intent=profile" Icon={SignIn} title="Уже есть аккаунт" subtitle="Войти и связать его с Telegram" />
            </div>
          </section>
        ) : (
          <>
            <section className={styles["profile-section"]}>
              <p className={styles.eyebrow}>аккаунт и работа со специалистом</p>
              <div className={styles["profile-rows"]}>
                {HUB_ROWS.map((row) => <ProfileRow key={row.href} {...row} meta={row.title === "Записи" ? bookingMeta : row.title === "Кошелёк" ? (data.loadError ? "—" : String(viewer.points)) : row.meta} />)}
              </div>
            </section>

            <section className={styles["referral-card"]}>
              <span className={styles["referral-icon"]}><Gift size={25} /></span>
              <div><small>ПОДАРИТЕ РАЗБОР</small><strong>Баллы придут вам обоим</strong><p>Друг начнёт со своего вопроса, ваш результат останется приватным.</p></div>
              <button type="button" onClick={() => share("Приглашение в ETerapy", "/miniapp/profile/invites")}><ShareNetwork size={17} /> Пригласить</button>
            </section>

            <section className={styles["profile-section"]}>
              <p className={styles.eyebrow}>настройки</p>
              <div className={styles["profile-rows"]}>{SETTINGS_ROWS.map((row) => <ProfileRow key={row.href} {...row} />)}</div>
            </section>
          </>
        )}

        <section className={styles["profile-support"]}>
          <Link href="/miniapp/support"><Lifebuoy size={20} /><span><strong>Поддержка</strong><small>Вопросы об услугах и оплате</small></span></Link>
          {/* INC-068: это была `<Link>`, а Next предзагружает цель ссылки, когда
              она попадает во вьюпорт — то есть открытие профиля разлогинивало
              человека молча, без нажатия. Выход — действие, а не переход. */}
          {viewer.authenticated ? (
            <button
              className={styles.signout}
              type="button"
              onClick={() => { window.location.href = "/api/auth/logout?callbackUrl=/miniapp"; }}
            >
              <SignOut size={20} /><span><strong>Выйти</strong><small>Завершить сессию на этом устройстве</small></span>
            </button>
          ) : null}
        </section>
      </div>
    </MiniAppChrome>
  );
}
