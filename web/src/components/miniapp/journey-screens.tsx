"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarBlank,
  CaretRight,
  Check,
  CheckCircle,
  Clock,
  Coins,
  CrownSimple,
  DownloadSimple,
  FileText,
  Gift,
  IdentificationCard,
  Lifebuoy,
  LinkSimple,
  Lock,
  Notebook,
  PaperPlaneTilt,
  Password,
  ShieldCheck,
  SignIn,
  Sparkle,
  Star,
  StarFour,
  Trash,
  User,
  UserPlus,
  Users,
  Wallet,
  type Icon,
} from "@phosphor-icons/react";
import type { AnonymousLibraryEntry } from "@/data/anonymous-library";
import type { MiniAppService } from "@/lib/miniapp/types";
import type { MiniAppOffer, MiniAppPractitionerCard } from "@/lib/miniapp/journey-data";
import { loadTelegramSdk } from "@/lib/miniapp/telegram/client";
import { MiniAppChrome, useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { miniAppClass as c, styles } from "@/components/miniapp/styles";

function BackLink({ href, label = "Назад" }: { href: string; label?: string }) {
  return <Link href={href} className={styles["subpage-back"]}><ArrowLeft size={17} /> {label}</Link>;
}

function PageHead({ eyebrow, title, description, back }: { eyebrow: string; title: string; description?: string; back: string }) {
  return (
    <header className={styles["subpage-head"]}>
      <BackLink href={back} />
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </header>
  );
}

function GateLink({ href, children }: { href: string; children: React.ReactNode }) {
  const { data } = useMiniAppV21();
  const target = data.viewer.authenticated ? href : `/miniapp/account?intent=continue&returnTo=${encodeURIComponent(href)}`;
  return <Link className={styles["journey-primary"]} href={target}>{children}<ArrowRight size={18} /></Link>;
}

export function ServiceDetailScreen({ service }: { service: MiniAppService }) {
  const { data, share } = useMiniAppV21();
  const next = service.id === "primary"
    ? "/miniapp/dialogues/new"
    : service.id === "specialist"
      ? "/miniapp/practitioners"
      : `/miniapp/services/${encodeURIComponent(service.id)}/prepare`;
  return (
    <MiniAppChrome data={data}>
      <article className={styles.subpage} data-testid="miniapp-service-detail">
        <PageHead back="/miniapp/services" eyebrow={service.eyebrow} title={service.title} description={service.description} />
        <section className={c("journey-hero", service.featured && "is-featured")}>
          <Image src="/miniapp/b474/service-orbit.png" alt="" width={416} height={470} />
          <div><small>СТОИМОСТЬ</small><strong>{service.price}</strong><span>{service.priceMeta}</span></div>
        </section>
        <section className={styles["journey-section"]}>
          <p className={styles.eyebrow}>что внутри</p>
          <div className={styles["benefit-list"]}>{service.mechanics.map((item) => <p key={item}><CheckCircle size={18} weight="fill" />{item}</p>)}</div>
        </section>
        <section className={styles["result-card"]}><StarFour size={23} /><div><small>РЕЗУЛЬТАТ</small><strong>{service.result}</strong></div></section>
        <p className={styles["privacy-card"]}><ShieldCheck size={18} />{service.privacy}</p>
        {data.viewer.authenticated || service.id === "primary" || service.id === "specialist"
          ? <Link className={styles["journey-primary"]} href={next}>{service.cta}<ArrowRight size={18} /></Link>
          : <GateLink href={next}>Продолжить</GateLink>}
        {service.shareable ? <button className={styles["journey-secondary"]} type="button" onClick={() => share(service.title, `/miniapp/services/${service.id}`)}><LinkSimple size={17} />Поделиться ссылкой</button> : null}
      </article>
    </MiniAppChrome>
  );
}

export function ServicePrepareScreen({ service }: { service: MiniAppService }) {
  const { data } = useMiniAppV21();
  const [question, setQuestion] = useState("");
  const reviewHref = `/miniapp/checkout/review?offer=${encodeURIComponent(`service:${service.id}`)}`;
  return (
    <MiniAppChrome data={data}>
      <div className={styles.subpage}>
        <PageHead back={`/miniapp/services/${service.id}`} eyebrow="подготовка" title="С чего начнём" description="Контекст сохранится только после входа. На оплату вы перейдёте отдельным шагом." />
        <label className={styles["journey-field"]}><span>Ваш вопрос или ситуация</span><textarea value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1200} placeholder="Опишите своими словами — можно коротко" /><small>{question.length} / 1200</small></label>
        <section className={styles["review-card"]}>
          <div className={styles["review-row"]}><span>Услуга</span><strong>{service.title}</strong></div>
          <div className={styles["review-row"]}><span>Результат</span><strong>{service.result}</strong></div>
          <div className={styles["review-row"]}><span>Стоимость</span><strong>{service.price}</strong></div>
        </section>
        <Link className={c("journey-primary", question.trim().length < 3 && "is-disabled")} aria-disabled={question.trim().length < 3} href={question.trim().length >= 3 ? reviewHref : "#question"} onClick={() => { if (question.trim()) window.sessionStorage.setItem(`eterapy:miniapp:service:${service.id}`, question.trim()); }}>Проверить заказ<ArrowRight size={18} /></Link>
        <p className={styles["flow-note"]}><ShieldCheck size={16} />Списание не происходит на этом экране.</p>
      </div>
    </MiniAppChrome>
  );
}

function PractitionerAvatar({ practitioner, size = 56 }: { practitioner: MiniAppPractitionerCard; size?: number }) {
  return practitioner.avatar
    ? <Image className={styles["practitioner-avatar"]} src={practitioner.avatar} alt="" width={size} height={size} />
    : <span className={styles["practitioner-avatar-fallback"]}><User size={Math.round(size * .45)} weight="fill" /></span>;
}

export function PractitionersScreen({ practitioners }: { practitioners: MiniAppPractitionerCard[] }) {
  const { data } = useMiniAppV21();
  const [format, setFormat] = useState("all");
  const filtered = useMemo(() => format === "all" ? practitioners : practitioners.filter((item) => item.categories.includes(format)), [format, practitioners]);
  return (
    <MiniAppChrome data={data}>
      <div className={styles.subpage} data-testid="miniapp-practitioners">
        <PageHead back="/miniapp/services" eyebrow="живые специалисты" title="Выберите человека" description="Профили из рабочего каталога ETerapy. Цена и формат видны до записи." />
        <div className={styles["compact-tabs"]} role="group" aria-label="Направление">
          {[{ id: "all", label: "Все" }, { id: "psychology", label: "Психология" }, { id: "esoteric", label: "Практики" }].map((item) => <button key={item.id} type="button" className={format === item.id ? styles["is-active"] : undefined} onClick={() => setFormat(item.id)}>{item.label}</button>)}
        </div>
        {filtered.length ? <div className={styles["practitioner-list"]}>{filtered.map((item) => (
          <Link key={item.slug} className={styles["practitioner-card"]} href={`/miniapp/practitioners/${item.slug}`}>
            <PractitionerAvatar practitioner={item} />
            <span><small>{item.verified ? "ПРОВЕРЕННЫЙ ПРОФИЛЬ" : "СПЕЦИАЛИСТ"}</small><strong>{item.name}</strong><em>{item.title}</em><span>{item.priceRub.toLocaleString("ru-RU")} ₽ · {item.durationMin} мин</span></span>
            <CaretRight size={19} />
          </Link>
        ))}</div> : <section className={styles["empty-detail"]}><Users size={28} /><strong>В этом фильтре пока нет профилей</strong><p>Показываем только реальные активные анкеты.</p></section>}
      </div>
    </MiniAppChrome>
  );
}

export function PractitionerDetailScreen({ practitioner }: { practitioner: MiniAppPractitionerCard }) {
  const { data, share } = useMiniAppV21();
  return (
    <MiniAppChrome data={data}>
      <article className={styles.subpage}>
        <PageHead back="/miniapp/practitioners" eyebrow="профиль специалиста" title={practitioner.name} />
        <section className={styles["practitioner-detail-card"]}>
          <PractitionerAvatar practitioner={practitioner} size={78} />
          <div><strong>{practitioner.title}</strong><p>{practitioner.bio}</p><span>{practitioner.priceRub.toLocaleString("ru-RU")} ₽ · {practitioner.durationMin} минут</span></div>
        </section>
        <div className={styles["trust-strip"]}><span><ShieldCheck size={18} />{practitioner.verified ? "Проверен ETerapy" : "Активный профиль"}</span><span><Star size={18} weight="fill" />{practitioner.reviewCount ? `${practitioner.rating.toFixed(1)} · ${practitioner.reviewCount}` : "Новый профиль"}</span></div>
        {practitioner.tags.length ? <section className={styles["journey-section"]}><p className={styles.eyebrow}>с чем работает</p><div className={styles["tag-list"]}>{practitioner.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></section> : null}
        <GateLink href={`/miniapp/practitioners/${practitioner.slug}/book`}>Посмотреть свободное время</GateLink>
        <button className={styles["journey-secondary"]} type="button" onClick={() => share(practitioner.name, `/miniapp/practitioners/${practitioner.slug}`)}><LinkSimple size={17} />Поделиться профилем</button>
      </article>
    </MiniAppChrome>
  );
}

type Slot = { id?: string; slotId?: string; startAt: string; endAt: string };

export function PractitionerBookingScreen({ practitioner }: { practitioner: MiniAppPractitionerCard }) {
  const { data } = useMiniAppV21();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const until = new Date(Date.now() + 30 * 86_400_000).toISOString();
    fetch(`/api/slots?practitionerId=${encodeURIComponent(practitioner.id)}&to=${encodeURIComponent(until)}`)
      .then((response) => response.json())
      .then((payload) => setSlots(Array.isArray(payload.slots) ? payload.slots : []))
      .catch(() => setSlots([]))
      .finally(() => setLoading(false));
  }, [practitioner.id]);
  const slot = slots.find((item) => (item.id ?? item.slotId) === selected);
  const review = slot ? `/miniapp/checkout/review?offer=${encodeURIComponent(`practitioner:${practitioner.slug}`)}&slot=${encodeURIComponent(slot.startAt)}` : "#time";
  return (
    <MiniAppChrome data={data}>
      <div className={styles.subpage}>
        <PageHead back={`/miniapp/practitioners/${practitioner.slug}`} eyebrow="запись" title="Выберите время" description={`${practitioner.name} · ${practitioner.durationMin} минут`} />
        <section className={styles["booking-person"]}><PractitionerAvatar practitioner={practitioner} /><div><strong>{practitioner.name}</strong><span>{practitioner.priceRub.toLocaleString("ru-RU")} ₽ за встречу</span></div></section>
        <div id="time" className={styles["slot-list"]}>
          {loading ? <p className={styles["flow-note"]}>Проверяем расписание…</p> : slots.length ? slots.map((item) => {
            const key = item.id ?? item.slotId ?? item.startAt;
            const date = new Date(item.startAt);
            return <button key={key} type="button" className={selected === key ? styles["is-selected"] : undefined} onClick={() => setSelected(key)}><CalendarBlank size={18} /><span><strong>{date.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" })}</strong><small>{date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</small></span><Check size={17} /></button>;
          }) : <section className={styles["empty-detail"]}><Clock size={28} /><strong>Свободное время уточняется</strong><p>Расписание показывает только реальные доступные слоты.</p></section>}
        </div>
        <Link className={c("journey-primary", !slot && "is-disabled")} aria-disabled={!slot} href={review}>Проверить запись<ArrowRight size={18} /></Link>
        <p className={styles["flow-note"]}>Запись не создаётся и оплата не списывается до следующего подтверждения.</p>
      </div>
    </MiniAppChrome>
  );
}

export function PackagesScreen({ offers }: { offers: MiniAppOffer[] }) {
  const { data } = useMiniAppV21();
  const [kind, setKind] = useState<"subscription" | "credits">("subscription");
  const visible = offers.filter((offer) => offer.kind === kind);
  return (
    <MiniAppChrome data={data}>
      <div className={styles.subpage}>
        <PageHead back="/miniapp/profile" eyebrow="пакеты и подписка" title="Выберите свой ритм" description="Только действующие предложения платформы. Никаких скрытых списаний." />
        <div className={styles["compact-tabs"]} role="group" aria-label="Тип предложения"><button type="button" className={kind === "subscription" ? styles["is-active"] : undefined} onClick={() => setKind("subscription")}>Подписка</button><button type="button" className={kind === "credits" ? styles["is-active"] : undefined} onClick={() => setKind("credits")}>Баллы</button></div>
        <div className={styles["offer-list"]}>{visible.map((offer) => <article key={offer.key} className={c("offer-card", offer.badge && "is-highlighted")}>
          <header><span><small>{offer.badge ?? (offer.kind === "subscription" ? "ТАРИФ" : "ПАКЕТ")}</small><strong>{offer.title}</strong></span><b>{offer.price}</b></header>
          <p>{offer.note}</p>
          <div>{offer.benefits.map((benefit) => <span key={benefit}><CheckCircle size={16} weight="fill" />{benefit}</span>)}</div>
          <GateLink href={`/miniapp/checkout/review?offer=${encodeURIComponent(offer.key)}`}>Выбрать</GateLink>
        </article>)}</div>
      </div>
    </MiniAppChrome>
  );
}

export type ReviewOffer = { key: string; title: string; price: string; note: string; kind: string };

export function CheckoutReviewScreen({ offer, slot }: { offer: ReviewOffer | null; slot?: string | null }) {
  const { data } = useMiniAppV21();
  return (
    <MiniAppChrome data={data}>
      <div className={styles.subpage} data-testid="miniapp-checkout-review">
        <PageHead back={offer?.kind === "practitioner" ? "/miniapp/practitioners" : "/miniapp/packages"} eyebrow="проверка" title="Перед оплатой" description="Это последний экран Mini App до подключения платёжного провайдера." />
        {offer ? <section className={styles["review-card"]}>
          <div className={styles["review-row"]}><span>Вы выбрали</span><strong>{offer.title}</strong></div>
          {slot ? <div className={styles["review-row"]}><span>Время</span><strong>{new Date(slot).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</strong></div> : null}
          <div className={styles["review-row"]}><span>Итого</span><strong>{offer.price}</strong></div>
          <div className={styles["review-row"]}><span>Условия</span><strong>{offer.note}</strong></div>
        </section> : <section className={styles["empty-detail"]}><Wallet size={28} /><strong>Предложение не найдено</strong><p>Вернитесь в каталог и выберите услугу ещё раз.</p></section>}
        <section className={styles["payment-hold"]}><Lock size={22} /><div><strong>Оплата пока не подключена</strong><p>Мы не создаём фиктивный платёж и не просим данные карты. Кнопка станет активной после отдельного этапа интеграции.</p></div></section>
        <button className={c("journey-primary", "is-disabled")} type="button" disabled>Перейти к оплате<ArrowRight size={18} /></button>
        <p className={styles["flow-note"]}><ShieldCheck size={16} />До подключения оплаты ничего не списывается.</p>
      </div>
    </MiniAppChrome>
  );
}

async function linkCurrentTelegram() {
  const telegram = await loadTelegramSdk();
  if (!telegram?.initData) return { linked: false as const, inTelegram: false as const };
  const response = await fetch("/api/miniapp/auth/telegram/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData: telegram.initData }) });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error ?? "Не удалось связать Telegram. Перезапустите Mini App и повторите вход.");
  }
  window.sessionStorage.setItem("eterapy:miniapp:telegram-linked", "1");
  return { linked: true as const, inTelegram: true as const };
}

export function AccountScreen({ initialMode, returnTo }: { initialMode: "login" | "register"; returnTo: string }) {
  const { data } = useMiniAppV21();
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptContract, setAcceptContract] = useState(false);
  const [acceptPdn, setAcceptPdn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [linkStatus, setLinkStatus] = useState<"idle" | "linking" | "linked">("idle");

  async function linkAuthenticatedAccount() {
    setError("");
    setLinkStatus("linking");
    try {
      const result = await linkCurrentTelegram();
      if (!result.inTelegram) throw new Error("Откройте эту страницу внутри Telegram Mini App.");
      setLinkStatus("linked");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось связать Telegram");
      setLinkStatus("idle");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (mode === "register" && (!acceptContract || !acceptPdn)) return setError("Нужно принять оферту и согласие на обработку данных");
    setLoading(true);
    try {
      if (mode === "register") {
        const response = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password, acceptContract, acceptPdn }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Не удалось создать аккаунт");
      }
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) throw new Error(mode === "login" ? "Неверный email или пароль" : "Аккаунт создан, но войти не удалось");
      try {
        await linkCurrentTelegram();
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : "Не удалось связать Telegram.";
        setError(`Вход выполнен. ${message} Закройте и заново откройте Mini App — повторно вводить пароль не понадобится.`);
        router.refresh();
        return;
      }
      router.replace(returnTo);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось продолжить");
    } finally {
      setLoading(false);
    }
  }

  if (data.viewer.authenticated) return <MiniAppChrome data={data}><div className={styles.subpage}><PageHead back="/miniapp/profile" eyebrow="аккаунт" title="Вы уже вошли" description={data.viewer.email ?? "Профиль связан с текущей сессией"} /><section className={styles["conversation-card"]}><span><ShieldCheck size={22} /><strong>{linkStatus === "linked" ? "Telegram связан" : "Включить сквозной вход"}</strong></span><p>{linkStatus === "linked" ? "При следующем открытии Mini App email и пароль не понадобятся." : "Свяжем только тот Telegram, из которого сейчас открыта Mini App. Это действие не выполняется автоматически."}</p><button className={styles["journey-primary"]} type="button" disabled={linkStatus !== "idle"} onClick={() => void linkAuthenticatedAccount()}>{linkStatus === "linking" ? "Проверяем…" : linkStatus === "linked" ? "Готово" : "Связать этот Telegram"}<ArrowRight size={18} /></button></section>{error ? <p className={styles["form-error"]} role="alert">{error}</p> : null}<Link className={styles["journey-secondary"]} href={returnTo}>Продолжить без привязки</Link></div></MiniAppChrome>;
  return (
    <MiniAppChrome data={data}>
      <div className={styles.subpage}>
        <PageHead back="/miniapp/profile" eyebrow="личное пространство" title={mode === "register" ? "Сохранить свои результаты" : "С возвращением"} description="В Telegram после привязки вход будет сквозным. На сайте останутся email и пароль." />
        <div className={styles["account-switch"]}><button type="button" className={mode === "register" ? styles["is-active"] : undefined} onClick={() => setMode("register")}><UserPlus size={17} />Новый аккаунт</button><button type="button" className={mode === "login" ? styles["is-active"] : undefined} onClick={() => setMode("login")}><SignIn size={17} />Уже есть</button></div>
        <form className={styles["account-form"]} onSubmit={submit}>
          {mode === "register" ? <label><span>Имя</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required placeholder="Как к вам обращаться" /></label> : null}
          <label><span>Email</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required placeholder="name@example.com" /></label>
          <label><span>Пароль</span><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required placeholder="Минимум 8 символов" /></label>
          {mode === "register" ? <div className={styles["consents"]}><label><input type="checkbox" checked={acceptContract} onChange={(event) => setAcceptContract(event.target.checked)} /><span>Принимаю <Link href="/legal/terms">пользовательское соглашение</Link> и <Link href="/legal/offer">оферту</Link>, подтверждаю возраст 18+</span></label><label><input type="checkbox" checked={acceptPdn} onChange={(event) => setAcceptPdn(event.target.checked)} /><span>Согласен на <Link href="/legal/consent">обработку персональных данных</Link> и ознакомлен с <Link href="/legal/privacy">политикой</Link></span></label></div> : null}
          {error ? <p className={styles["form-error"]} role="alert">{error}</p> : null}
          <button className={styles["journey-primary"]} type="submit" disabled={loading}>{loading ? "Проверяем…" : mode === "register" ? "Создать и связать" : "Войти и связать"}<ArrowRight size={18} /></button>
        </form>
        <p className={styles["flow-note"]}><ShieldCheck size={16} />Telegram ID используется только внутри Telegram Mini App.</p>
      </div>
    </MiniAppChrome>
  );
}

export function LibraryScreen({ entries }: { entries: AnonymousLibraryEntry[] }) {
  const { data } = useMiniAppV21();
  return <MiniAppChrome data={data}><div className={styles.subpage}><PageHead back="/miniapp/dialogues" eyebrow="библиотека вопросов" title="Вы не одни с этим вопросом" description="Анонимные одобренные истории из действующей библиотеки платформы." /><div className={styles["library-list"]}>{entries.map((entry) => <Link href={`/miniapp/library/${entry.slug}`} key={entry.slug}><small>{entry.topic}</small><strong>{entry.question}</strong><span>{entry.reactions} откликов <ArrowRight size={16} /></span></Link>)}</div></div></MiniAppChrome>;
}

export function LibraryDetailScreen({ entry }: { entry: AnonymousLibraryEntry }) {
  const { data, share } = useMiniAppV21();
  return <MiniAppChrome data={data}><article className={styles.subpage}><PageHead back="/miniapp/library" eyebrow={entry.topic} title={entry.question} /><section className={styles["library-summary"]}><Sparkle size={23} /><p>{entry.summary}</p></section><section className={styles["journey-section"]}><p className={styles.eyebrow}>три перспективы</p><div className={styles["insight-list"]}>{entry.perspectives.map((item, index) => <p key={item}><span>{index + 1}</span>{item}</p>)}</div></section><GateLink href="/miniapp/dialogues/new">Задать свой вопрос</GateLink><button className={styles["journey-secondary"]} type="button" onClick={() => share(entry.question, `/miniapp/library/${entry.slug}`)}><LinkSimple size={17} />Поделиться</button></article></MiniAppChrome>;
}

export function DialogueNewScreen() {
  const { data, notify } = useMiniAppV21();
  const [question, setQuestion] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setQuestion(window.sessionStorage.getItem("eterapy:miniapp-question") ?? ""), 0);
    return () => window.clearTimeout(timer);
  }, []);
  return <MiniAppChrome data={data}><div className={styles.subpage}><PageHead back="/miniapp" eyebrow="новый диалог" title="Один вопрос за раз" description="Первичный взгляд бесплатный. Следующий шаг выбираете только вы." /><label className={styles["journey-field"]}><span>С чем хотите разобраться?</span><textarea value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1200} placeholder="Опишите ситуацию своими словами" /><small>{question.length} / 1200</small></label><Link className={c("journey-primary", question.trim().length < 3 && "is-disabled")} aria-disabled={question.trim().length < 3} href={question.trim().length >= 3 ? "/checkin?miniappDraft=1" : "#question"} onClick={() => { if (question.trim().length < 3) notify("Напишите хотя бы несколько слов"); else window.sessionStorage.setItem("eterapy:miniapp-question", question.trim()); }}>Начать первичный разбор<PaperPlaneTilt size={18} /></Link><p className={styles["flow-note"]}><ShieldCheck size={16} />Вопрос не публикуется. Рабочий диалог откроется без оплаты.</p></div></MiniAppChrome>;
}

export function DialogueDetailScreen({ dialogueId }: { dialogueId: string }) {
  const { data } = useMiniAppV21();
  const dialogue = data.dialogues.find((item) => item.id === dialogueId);
  return <MiniAppChrome data={data}><div className={styles.subpage}><PageHead back="/miniapp/dialogues" eyebrow={dialogue?.topic ?? "диалог"} title={dialogue?.title ?? "Открыть диалог"} description={dialogue ? `${dialogue.status} · ${dialogue.updated}` : "Диалог доступен в вашем личном пространстве"} />{dialogue ? <section className={styles["conversation-card"]}><span><Notebook size={22} /><strong>{dialogue.messageCount} сообщений</strong></span><p>Продолжение откроется в рабочем диалоге платформы — без потери истории.</p><Link className={styles["journey-primary"]} href={dialogue.href}>Продолжить<ArrowRight size={18} /></Link></section> : <section className={styles["empty-detail"]}><Lock size={28} /><strong>Диалог не найден</strong><p>Войдите в аккаунт или вернитесь к списку.</p></section>}</div></MiniAppChrome>;
}

export function DiaryDetailScreen({ itemId }: { itemId: string }) {
  const { data, share } = useMiniAppV21();
  const item = data.diaryItems.find((entry) => entry.id === itemId);
  return <MiniAppChrome data={data}><article className={styles.subpage}><PageHead back="/miniapp/diary" eyebrow={item?.topic ?? "дневник"} title={item?.title ?? "Запись"} description={item?.date} />{item ? <><section className={styles["library-summary"]}><Notebook size={23} /><p>{item.insight}</p></section><Link className={styles["journey-primary"]} href={item.href}>Открыть полный результат<ArrowRight size={18} /></Link><button className={styles["journey-secondary"]} type="button" onClick={() => share(item.title, `/miniapp/diary/${item.id}`)}><LinkSimple size={17} />Поделиться анонимно</button></> : <section className={styles["empty-detail"]}><Lock size={28} /><strong>Запись не найдена</strong><p>Личные записи доступны только после входа.</p></section>}</article></MiniAppChrome>;
}

type ProfileSection = "about" | "security" | "notifications" | "data" | "bookings" | "materials" | "wallet" | "invites" | "subscription";
const PROFILE_CONTENT: Record<ProfileSection, { eyebrow: string; title: string; description: string; Icon: Icon; rows: Array<{ Icon: Icon; title: string; text: string; href?: string }> }> = {
  about: { eyebrow: "профиль", title: "О себе", description: "Базовые данные и темы, которые помогают не начинать с нуля.", Icon: IdentificationCard, rows: [{ Icon: User, title: "Имя", text: "Из профиля ETerapy" }, { Icon: Notebook, title: "Темы и цели", text: "Добавление будет доступно в форме профиля" }] },
  security: { eyebrow: "настройки", title: "Безопасность", description: "Email, пароль и связанные приложения.", Icon: Lock, rows: [{ Icon: Password, title: "Пароль", text: "Изменяется только после подтверждения email", href: "/forgot-password" }, { Icon: LinkSimple, title: "Telegram", text: "Связывается подписанным запуском внутри Mini App" }, { Icon: ShieldCheck, title: "Вход с сайта", text: "Только email и пароль" }] },
  notifications: { eyebrow: "настройки", title: "Уведомления", description: "Сервисные напоминания без лишних сообщений.", Icon: Bell, rows: [{ Icon: Bell, title: "Telegram", text: "Напоминания доступны после привязки" }, { Icon: CalendarBlank, title: "Записи", text: "Время встречи и изменения расписания" }] },
  data: { eyebrow: "приватность", title: "Данные и удаление", description: "Экспорт, деактивация и понятные последствия.", Icon: ShieldCheck, rows: [{ Icon: DownloadSimple, title: "Экспорт данных", text: "Собрать архив аккаунта", href: "/api/auth/export-data" }, { Icon: Trash, title: "Деактивация", text: "Требует отдельного подтверждения" }] },
  bookings: { eyebrow: "встречи", title: "Мои записи", description: "Будущие и завершённые встречи со специалистами.", Icon: CalendarBlank, rows: [{ Icon: CalendarBlank, title: "Ближайшая запись", text: "Появится после подтверждения бронирования" }, { Icon: Users, title: "Выбрать специалиста", text: "Открыть каталог", href: "/miniapp/practitioners" }] },
  materials: { eyebrow: "после встречи", title: "Материалы", description: "Задания и файлы, которые отправил специалист.", Icon: FileText, rows: [{ Icon: FileText, title: "Новых материалов нет", text: "Здесь не будет общего чата — только полезные артефакты" }] },
  wallet: { eyebrow: "баллы", title: "Кошелёк", description: "Баланс, пакеты и понятный срок действия.", Icon: Wallet, rows: [{ Icon: Coins, title: "Текущий баланс", text: "Баллы видны в верхней панели" }, { Icon: Gift, title: "Пакеты баллов", text: "Посмотреть варианты", href: "/miniapp/packages" }] },
  invites: { eyebrow: "приглашения", title: "Делиться бережно", description: "Друг получает свой первый шаг, ваши данные не раскрываются.", Icon: Gift, rows: [{ Icon: Gift, title: "Личная ссылка", text: "Будет создана для вашего аккаунта" }, { Icon: ShieldCheck, title: "Приватность", text: "Чужие вопросы и результаты не связываются" }] },
  subscription: { eyebrow: "тариф", title: "Моя подписка", description: "Текущий план и варианты без скрытого переключения.", Icon: CrownSimple, rows: [{ Icon: CrownSimple, title: "Текущий план", text: "Статус показан в профиле" }, { Icon: Wallet, title: "Сравнить варианты", text: "Открыть тарифы", href: "/miniapp/packages" }] },
};

export function ProfileSectionScreen({ section }: { section: ProfileSection }) {
  const { data } = useMiniAppV21();
  const content = PROFILE_CONTENT[section];
  const HeaderIcon = content.Icon;
  return <MiniAppChrome data={data}><div className={styles.subpage}><PageHead back="/miniapp/profile" eyebrow={content.eyebrow} title={content.title} description={content.description} /><section className={styles["settings-hero"]}><HeaderIcon size={27} /><div><small>ВАШ ПРОФИЛЬ</small><strong>{section === "wallet" ? `${data.viewer.points} баллов` : section === "subscription" ? data.viewer.plan : data.viewer.email ?? "Гостевой режим"}</strong></div></section><div className={styles["settings-list"]}>{content.rows.map(({ Icon: RowIcon, title, text, href }) => { const body = <><span><RowIcon size={19} /></span><span><strong>{title}</strong><small>{text}</small></span>{href ? <CaretRight size={18} /> : null}</>; return href ? <Link href={href} key={title}>{body}</Link> : <div key={title}>{body}</div>; })}</div>{!data.viewer.authenticated ? <GateLink href={`/miniapp/profile/${section}`}>Войти, чтобы управлять</GateLink> : null}</div></MiniAppChrome>;
}

export function HelpScreen() {
  const { data } = useMiniAppV21();
  return <MiniAppChrome data={data}><div className={styles.subpage}><PageHead back="/miniapp" eyebrow="помощь" title="Коротко о главном" description="Как устроены вопросы, приватность и покупки." /><div className={styles["settings-list"]}><div id="dialogue"><span><PaperPlaneTilt size={19} /></span><span><strong>Первичный разбор</strong><small>Начинается бесплатно с одного вопроса. Платные шаги предлагаются отдельно.</small></span></div><div><span><Notebook size={19} /></span><span><strong>Дневник</strong><small>Хранит ваши результаты и личные наблюдения после входа.</small></span></div><div id="payments"><span><Wallet size={19} /></span><span><strong>Оплата</strong><small>Провайдер пока не подключён в Mini App; данные карты не собираются.</small></span></div><div id="support"><span><Lifebuoy size={19} /></span><span><strong>Поддержка</strong><small>support@eterapy.com</small></span></div></div><Link className={styles["journey-secondary"]} href="mailto:support@eterapy.com"><Lifebuoy size={17} />Написать в поддержку</Link></div></MiniAppChrome>;
}
