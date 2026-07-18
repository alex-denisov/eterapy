"use client";

import Link from "next/link";
import {
  ArrowRight, Bell, CalendarCheck, Coins, CreditCard, FileText, Gear,
  Lifebuoy, LockKey, SignIn, UserCircle,
} from "@phosphor-icons/react";
import { useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { AccountGate, PageHeading, SectionHeader } from "@/components/miniapp/miniapp-ui";
import styles from "@/app/miniapp/miniapp.module.css";

const PROFILE_LINKS = [
  { href: "/cabinet/settings", Icon: Gear, title: "Настройки аккаунта", text: "Email, пароль и личные данные" },
  { href: "/cabinet/bookings", Icon: CalendarCheck, title: "Записи к специалистам", text: "Будущие и завершённые встречи" },
  { href: "/cabinet/messages", Icon: FileText, title: "Материалы специалиста", text: "Домашние задания и файлы после встреч" },
  { href: "/cabinet/settings", Icon: Bell, title: "Уведомления и способы связи", text: "Telegram-уведомления и часовой пояс" },
  { href: "/cabinet/support", Icon: Lifebuoy, title: "Помощь и поддержка", text: "Вопросы, оплата и обращения" },
] as const;

export function ProfileScreen() {
  const { data } = useMiniAppV21();
  const viewer = data.viewer;
  return <div className={styles.screen} data-testid="miniapp-profile-screen">
    <PageHeading eyebrow="ВАШЕ ПРОСТРАНСТВО" title="Профиль" description="Тариф, записи и настройки без дублирования разделов." action={<span className={styles.profileAvatar}><UserCircle size={28} weight="duotone" /></span>} />

    <section className={styles.planCard}>
      <div><small>ТЕКУЩИЙ ТАРИФ</small><strong>{viewer.plan}</strong><p>{viewer.planStatus}. Условия можно посмотреть до любого изменения.</p></div>
      <Link href={viewer.authenticated ? "/cabinet/billing" : "/pricing"}>{viewer.authenticated ? "Управлять" : "Сравнить тарифы"}<ArrowRight size={17} /></Link>
    </section>

    {!viewer.authenticated ? <AccountGate title="Свяжите прогресс с аккаунтом" text="Задайте email и пароль один раз. На сайте вход будет по ним, а Telegram-связка появится после защищённого identity-этапа." next="/miniapp/profile" /> : null}

    {viewer.authenticated && !viewer.client ? <section className={styles.accountGate}><LockKey size={25} /><div><h2>Mini App пока только для клиента</h2><p>Кабинеты практика и администратора остаются в web-версии.</p></div><Link className={styles.primaryButton} href="/cabinet">Открыть web-кабинет<ArrowRight size={18} /></Link></section> : null}

    {viewer.authenticated && viewer.client ? <>
      <section className={styles.profileSummary} aria-label="Короткая сводка">
        <Link href="/cabinet/wallet"><Coins size={19} /><span><strong>{viewer.points}</strong><small>баллов</small></span></Link>
        <Link href="/cabinet/bookings"><CalendarCheck size={19} /><span><strong>{data.upcomingBookingLabel ?? "Нет"}</strong><small>ближайшая запись</small></span></Link>
      </section>

      <section className={styles.profileLinks}>
        <SectionHeader eyebrow="АККАУНТ И СЕРВИС" title={viewer.firstName} action={viewer.email ? <span className={styles.profileEmail}>{viewer.email}</span> : null} />
        {PROFILE_LINKS.map(({ href, Icon, title, text }) => <Link key={title} href={href} className={styles.profileRow}><span><Icon size={19} /></span><span><strong>{title}</strong><small>{text}</small></span><ArrowRight size={17} /></Link>)}
      </section>

      <section className={styles.profileLinks}>
        <SectionHeader eyebrow="ОПЛАТА И ДОКУМЕНТЫ" title="Всё под контролем" />
        <Link href="/cabinet/billing" className={styles.profileRow}><span><CreditCard size={19} /></span><span><strong>Покупки и подписка</strong><small>История операций и условия</small></span><ArrowRight size={17} /></Link>
        <Link href="/legal/privacy" className={styles.profileRow}><span><FileText size={19} /></span><span><strong>Правила и приватность</strong><small>Документы ETerapy</small></span><ArrowRight size={17} /></Link>
      </section>
    </> : null}

    {!viewer.authenticated ? <Link href={`/login?next=${encodeURIComponent("/miniapp/profile")}`} className={styles.loginRow}><SignIn size={19} /><span><strong>Войти по email</strong><small>Для уже существующего аккаунта</small></span><ArrowRight size={17} /></Link> : null}
  </div>;
}
