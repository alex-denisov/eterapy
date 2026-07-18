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
  { href: "/miniapp/profile/security", Icon: Lock, title: "Безопасность", subtitle: "Email, пароль и связанные приложения" },
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
        {meta ? <em>{meta}</em> : null}
        <ArrowRight className={styles["profile-row-caret"]} size={18} />
      </Link>
    </article>
  );
}

export function ProfileScreen() {
  const { data, viewerName, share } = useMiniAppV21();
  const viewer = data.viewer;
  const bookingMeta = data.upcomingBookingLabel ? "1" : undefined;

  return (
    <MiniAppChrome data={data}>
      <div className={styles["profile-screen"]} data-screen="profile" data-testid="miniapp-profile-screen">
        <section className={styles["page-heading"]}>
          <div className={styles["page-heading-copy"]}><p className={styles.eyebrow}>аккаунт</p><h1>Профиль</h1><p className={styles["page-description"]}>Данные, записи и способы оставаться на связи.</p></div>
        </section>

        <section className={styles["profile-card"]}>
          <span className={styles["profile-avatar"]}><User size={29} weight="fill" /></span>
          <span><strong>{viewer.authenticated ? viewerName : `${viewerName}, пока без аккаунта`}</strong><small>{viewer.email ?? "Telegram запомнит гостевой вход"} · {viewer.plan.toLocaleLowerCase("ru")}</small></span>
          <Link href={viewer.authenticated ? "/miniapp/profile/about" : "/miniapp/account?intent=profile"}>{viewer.authenticated ? "Изменить" : "Сохранить"}</Link>
        </section>

        <section className={styles["plan-card"]} aria-label="Текущий тариф">
          <span className={styles["plan-icon"]}><CrownSimple size={21} weight="duotone" /></span>
          <div><small>ТЕКУЩИЙ ТАРИФ</small><strong>{viewer.plan}</strong><p>{viewer.planStatus}. Условия видны до любого изменения.</p></div>
          <Link href="/miniapp/packages">Изменить тариф <ArrowRight size={15} /></Link>
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
                {HUB_ROWS.map((row) => <ProfileRow key={row.href} {...row} meta={row.title === "Записи" ? bookingMeta : row.title === "Кошелёк" ? String(viewer.points) : row.meta} />)}
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
          <Link href="/miniapp/help#support"><Lifebuoy size={20} /><span><strong>Поддержка</strong><small>Вопросы об услугах и оплате</small></span></Link>
          {viewer.authenticated ? <Link className={styles.signout} href="/api/auth/logout?callbackUrl=/miniapp"><SignOut size={20} /><span><strong>Выйти</strong><small>Завершить сессию на этом устройстве</small></span></Link> : null}
        </section>
      </div>
    </MiniAppChrome>
  );
}
