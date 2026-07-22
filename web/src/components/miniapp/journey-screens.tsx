"use client";

import { useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  ArrowRight,
  Bell,
  CalendarBlank,
  CaretDown,
  CaretRight,
  CheckCircle,
  CrownSimple,
  DownloadSimple,
  FileText,
  Gift,
  IdentificationCard,
  LinkSimple,
  Lock,
  MagnifyingGlass,
  Notebook,
  Paperclip,
  Password,
  ShieldCheck,
  SignIn,
  Sparkle,
  Star,
  Trash,
  User,
  UserPlus,
  Users,
  VideoCamera,
  Wallet,
  type Icon,
} from "@phosphor-icons/react";
import type { AnonymousLibraryEntry } from "@/data/anonymous-library";
import type { MiniAppOffer, MiniAppPractitionerCard } from "@/lib/miniapp/journey-data";
import { insideTelegram, loadTelegramSdk, openTelegramInvoice } from "@/lib/miniapp/telegram/client";
import { purchaseBodyFor } from "@/lib/miniapp/purchase-body";
import { MINIAPP_DIRECTIONS, matchesDirection, type MiniAppDirection } from "@/lib/miniapp/practitioner-filter";
import { MiniAppChrome, useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { GlassSegmented } from "@/components/miniapp/glass-segmented";
import { PageHead, PractitionerAvatar } from "@/components/miniapp/subpage-ui";
import { miniAppClass as c, styles } from "@/components/miniapp/styles";

function GateLink({ href, children }: { href: string; children: React.ReactNode }) {
  const { data } = useMiniAppV21();
  const target = data.viewer.authenticated ? href : `/miniapp/account?intent=continue&returnTo=${encodeURIComponent(href)}`;
  return <Link className={styles["journey-primary"]} href={target}>{children}<ArrowRight size={18} /></Link>;
}

function counted(value: number, one: string, few: string, many: string) {
  const mod100 = value % 100;
  const mod10 = value % 10;
  const word = mod100 >= 11 && mod100 <= 14 ? many : mod10 === 1 ? one : mod10 >= 2 && mod10 <= 4 ? few : many;
  return `${value} ${word}`;
}

const subscribeToTelegramSurface = () => () => {};

/**
 * B559: витрина специалистов.
 *
 * Была «полотном» — одинаковые строки 82px подряд, без иерархии: ни на ком не
 * задерживается взгляд, все профили выглядят одинаково важными. Стало: первый
 * профиль подборки — крупной карточкой с портретом, остальные — плиткой 2-в-ряд,
 * где фотография занимает верх карточки. Фильтр направлений — тот же стеклянный
 * контрол и те же ярлыки, что на «Услугах» (в том числе «Эзотерика» вместо
 * прежних «Практик», на которые указал владелец).
 */
export function PractitionersScreen({ practitioners }: { practitioners: MiniAppPractitionerCard[] }) {
  const { data } = useMiniAppV21();
  const [direction, setDirection] = useState<MiniAppDirection>("all");
  const filtered = useMemo(
    () => practitioners.filter((item) => matchesDirection(direction, item)),
    [direction, practitioners],
  );
  const [lead, ...rest] = filtered;

  return (
    <MiniAppChrome data={data}>
      <div className={styles.subpage} data-testid="miniapp-practitioners">
        <PageHead back="/miniapp/services" eyebrow="живые специалисты" title="Выберите человека" description="Профили из рабочего каталога ETerapy. Цена и формат видны до записи." />
        <GlassSegmented label="Направление" options={MINIAPP_DIRECTIONS} value={direction} onChange={(value) => setDirection(value as MiniAppDirection)} />

        {lead ? (
          <>
            <Link className={styles["practitioner-lead"]} href={`/miniapp/practitioners/${lead.slug}`}>
              <PractitionerAvatar practitioner={lead} size={92} />
              <span>
                <small>{lead.verified ? "ПРОВЕРЕННЫЙ ПРОФИЛЬ" : "АКТИВНЫЙ ПРОФИЛЬ"}</small>
                <strong>{lead.name}</strong>
                <em>{lead.title}</em>
                <b>{lead.priceRub.toLocaleString("ru-RU")} ₽ · {lead.durationMin} мин</b>
              </span>
            </Link>

            {rest.length ? (
              <div className={styles["practitioner-grid"]}>
                {rest.map((item) => (
                  <Link key={item.slug} className={styles["practitioner-tile"]} href={`/miniapp/practitioners/${item.slug}`}>
                    <PractitionerAvatar practitioner={item} size={132} />
                    <strong>{item.name}</strong>
                    <em>{item.title}</em>
                    <b>{item.priceRub.toLocaleString("ru-RU")} ₽</b>
                  </Link>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <section className={styles["empty-detail"]}>
            <Users size={28} /><strong>В этом направлении пока нет профилей</strong><p>Показываем только реальные активные анкеты.</p>
          </section>
        )}
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

export function PackagesScreen({ offers, initialKind = "subscription" }: { offers: MiniAppOffer[]; initialKind?: "subscription" | "credits" }) {
  const { data } = useMiniAppV21();
  // B554 п.10: вкладка жила только в стейте, поэтому ссылка «купить баллы»
  // из любого CTA открывала экран на вкладке «Подписка». Вкладка теперь в URL,
  // и переход попадает сразу туда, куда человек нажал.
  const [kind, setKind] = useState<"subscription" | "credits">(initialKind);
  function selectKind(next: "subscription" | "credits") {
    setKind(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next === "credits" ? "credits" : "subscription");
    window.history.replaceState(null, "", url.toString());
  }
  const visible = offers.filter((offer) => offer.kind === kind);
  return (
    <MiniAppChrome data={data}>
      <div className={styles.subpage}>
        <PageHead back="/miniapp/profile" eyebrow="пакеты и подписка" title="Выберите свой ритм" description="Только действующие предложения платформы. Никаких скрытых списаний." />
        <div className={styles["compact-tabs"]} role="group" aria-label="Тип предложения"><button type="button" className={kind === "subscription" ? styles["is-active"] : undefined} onClick={() => selectKind("subscription")}>Подписка</button><button type="button" className={kind === "credits" ? styles["is-active"] : undefined} onClick={() => selectKind("credits")}>Баллы</button></div>
        <div className={styles["offer-list"]}>{visible.map((offer) => <article key={offer.key} className={c("offer-card", offer.badge && "is-highlighted")}>
          <header><span><small>{offer.badge ?? (offer.kind === "subscription" ? "ТАРИФ" : "ПАКЕТ")}</small><strong>{offer.title}</strong></span><b>{offer.price}</b></header>
          <p>{offer.note}</p>
          <div>{offer.benefits.map((benefit) => <span key={benefit}><CheckCircle size={16} weight="fill" />{benefit}</span>)}</div>
          {/* B554 п.10: «Выбрать» ничего не обещает — человек идёт покупать. */}
          <GateLink href={`/miniapp/checkout/review?offer=${encodeURIComponent(offer.key)}`}>{offer.kind === "credits" ? "Купить баллы" : "Оформить подписку"}</GateLink>
        </article>)}</div>
      </div>
    </MiniAppChrome>
  );
}

export type ReviewOffer = { key: string; title: string; price: string; note: string; kind: string };

export function CheckoutReviewScreen({ offer, slot, cardPaymentEnabled = false }: { offer: ReviewOffer | null; slot?: string | null; cardPaymentEnabled?: boolean }) {
  const { data } = useMiniAppV21();
  const router = useRouter();
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  // B529: правила Telegram и сторов — цифровой товар внутри мини-аппа
  // продаётся ТОЛЬКО за Stars. Внешняя платёжная ссылка там не «другой способ
  // оплаты», а нарушение, за которое снимают бота. Определяем поверхность после
  // монтирования: на сервере Telegram SDK нет, и разметка обязана совпасть.
  const starsRail = useSyncExternalStore(
    subscribeToTelegramSurface,
    insideTelegram,
    () => false,
  );

  // B529: оплата звёздами. Права выдаёт вебхук `successful_payment` на сервере —
  // колбэк окна оплаты лишь говорит, чем кончилось окно, и верить ему как
  // источнику покупки нельзя. Поэтому на `paid` экран ПЕРЕЧИТЫВАЕТ состояние
  // с сервера, а не рисует успех сам.
  async function payWithStars() {
    if (!offer) return;
    setPaying(true);
    setPayError(null);
    try {
      const response = await fetch("/api/miniapp/billing/stars-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(purchaseBodyFor(offer, "miniapp-stars-review")),
      });
      const payload = await response.json().catch(() => ({})) as { invoiceLink?: string; error?: string };
      if (!response.ok || !payload.invoiceLink) {
        setPayError(response.status === 401
          ? "Сессия истекла. Войдите в аккаунт и попробуйте ещё раз."
          : payload.error ?? "Не удалось выставить счёт. Попробуйте ещё раз.");
        return;
      }
      const status = await openTelegramInvoice(payload.invoiceLink);
      if (status === "paid") {
        // Вебхук мог ещё не доехать — обновляем данные, а не обещаем баллы.
        router.refresh();
        router.push("/miniapp/profile/wallet");
        return;
      }
      if (status === "failed") setPayError("Оплата не прошла. Звёзды не списаны.");
      // «cancelled» — человек закрыл окно сам, сообщать не о чем.
    } catch {
      setPayError("Нет связи с сервером. Попробуйте ещё раз.");
    } finally {
      setPaying(false);
    }
  }

  // B554 (owner): раньше экран ВСЕГДА говорил «оплата картой появится скоро» и
  // держал кнопку выключенной. Теперь и текст, и кнопка идут от готовности
  // рельса: пока кредов на сервере нет — честное «скоро», как только они есть —
  // настоящий переход на оплату.
  async function pay() {
    if (!offer) return;
    setPaying(true);
    setPayError(null);
    try {
      // B573: раньше здесь ВСЕГДА уходил `productKey`, даже когда покупали
      // пакет баллов или подписку, — прейскурант такой ключ не знает и оплата
      // падала на разборе покупки. Теперь тот же разбор, что у звёзд.
      const response = await fetch("/api/billing/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(purchaseBodyFor(offer, "miniapp-checkout-review")),
      });
      const payload = await response.json().catch(() => ({})) as { confirmationUrl?: string; error?: string };
      if (!response.ok || !payload.confirmationUrl) {
        setPayError(response.status === 401
          ? "Сессия истекла. Войдите в аккаунт и попробуйте ещё раз."
          : payload.error ?? "Не удалось открыть оплату. Попробуйте ещё раз.");
        return;
      }
      window.location.href = payload.confirmationUrl;
    } catch {
      setPayError("Нет связи с сервером. Попробуйте ещё раз.");
    } finally {
      setPaying(false);
    }
  }

  return (
    <MiniAppChrome data={data}>
      <div className={styles.subpage} data-testid="miniapp-checkout-review">
        <PageHead back={offer?.kind === "practitioner" ? "/miniapp/practitioners" : "/miniapp/packages"} eyebrow="проверка" title="Перед оплатой" description="Проверьте услугу, стоимость и условия перед следующим шагом." />
        {offer ? <section className={styles["review-card"]}>
          <div className={styles["review-row"]}><span>Вы выбрали</span><strong>{offer.title}</strong></div>
          {slot ? <div className={styles["review-row"]}><span>Время</span><strong>{new Date(slot).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</strong></div> : null}
          <div className={styles["review-row"]}><span>Итого</span><strong>{offer.price}</strong></div>
          <div className={styles["review-row"]}><span>Условия</span><strong>{offer.note}</strong></div>
        </section> : <section className={styles["empty-detail"]}><Wallet size={28} /><strong>Предложение не найдено</strong><p>Вернитесь в каталог и выберите услугу ещё раз.</p></section>}

        {starsRail ? (
          /* B529: внутри Telegram — только звёзды. */
          <>
            <section className={styles["payment-hold"]}><Star size={22} /><div><strong>Оплата звёздами Telegram</strong><p>Счёт откроется в Telegram. Баллы и доступы начисляются те же, что при оплате на сайте.</p></div></section>
            <button className={styles["journey-primary"]} type="button" onClick={() => void payWithStars()} disabled={!offer || paying} data-testid="miniapp-pay-stars">
              {paying ? "Открываем счёт…" : "Оплатить звёздами"}<ArrowRight size={18} />
            </button>
            {payError ? <p className={styles["form-error"]} role="alert">{payError}</p> : null}
            <p className={styles["flow-note"]}><ShieldCheck size={16} />Звёзды списывает Telegram — данные карты к нам не попадают.</p>
          </>
        ) : cardPaymentEnabled ? (
          <>
            <section className={styles["payment-hold"]}><ShieldCheck size={22} /><div><strong>Оплата на защищённой странице банка</strong><p>Данные карты вводятся у платёжного партнёра — на нашей стороне они не сохраняются.</p></div></section>
            <button className={styles["journey-primary"]} type="button" onClick={() => void pay()} disabled={!offer || paying}>
              {paying ? "Открываем оплату…" : "Перейти к оплате"}<ArrowRight size={18} />
            </button>
            {payError ? <p className={styles["form-error"]} role="alert">{payError}</p> : null}
            <p className={styles["flow-note"]}><ShieldCheck size={16} />Чек придёт на вашу почту после оплаты.</p>
          </>
        ) : (
          <>
            <section className={styles["payment-hold"]}><Lock size={22} /><div><strong>Оплата картой появится скоро</strong><p>Сейчас заказ не создаётся и данные карты не запрашиваются.</p></div></section>
            <button className={c("journey-primary", "is-disabled")} type="button" disabled>Оплата скоро<ArrowRight size={18} /></button>
            <p className={styles["flow-note"]}><ShieldCheck size={16} />На этом экране ничего не списывается.</p>
          </>
        )}
      </div>
    </MiniAppChrome>
  );
}

async function linkCurrentTelegram() {
  const telegram = await loadTelegramSdk();
  if (!telegram?.initData) return { linked: false as const, inTelegram: false as const };
  const response = await fetch("/api/miniapp/auth/telegram/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData: telegram.initData }) });
  // B555: серверные формулировки («Telegram SSO отключён») — для логов, не для
  // клиента. Наружу отдаём одну человеческую фразу.
  if (!response.ok) throw new Error("Не получилось связать аккаунт с Telegram. Это не мешает работе — попробуйте позже.");
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
  // B554 п.6: owner видел «Подключить вход через Telegram», уже войдя ЧЕРЕЗ
  // Telegram, и по нажатии получал ошибку. Состояние связки сервер уже отдаёт —
  // экран его просто не читал и всегда стартовал с «idle».
  const [linkStatus, setLinkStatus] = useState<"idle" | "linking" | "linked">(
    data.viewer.telegramLinked ? "linked" : "idle",
  );

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
      // B555: привязка Telegram — необязательный довесок к входу. Раньше её
      // отказ выводился как ошибка входа («Вход выполнен. Telegram SSO
      // отключен. Закройте и заново откройте Mini App…») — текст для
      // разработчика на экране клиента, который в этот момент УЖЕ вошёл.
      // Вход состоялся: ведём дальше, а состояние связки экран покажет сам.
      await linkCurrentTelegram().catch(() => undefined);
      router.replace(returnTo);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось продолжить");
    } finally {
      setLoading(false);
    }
  }

  // B555: раньше здесь всегда висел блок «Подключить вход через Telegram» с
  // кнопкой, которая на стенде без Telegram-входа отвечала 404, а у уже
  // привязанного аккаунта не делала ничего. Экран показывает ровно одно из
  // трёх: связка есть (статус, без кнопки) · связку можно сделать (действие) ·
  // вход через Telegram на стенде выключен (блока нет вовсе).
  if (data.viewer.authenticated) {
    const linked = linkStatus === "linked";
    const canLink = data.viewer.telegramLinkAvailable && !linked;
    return (
      <MiniAppChrome data={data}>
        <div className={styles.subpage}>
          <PageHead
            back="/miniapp/profile"
            eyebrow="аккаунт"
            title="Вы вошли"
            description={data.viewer.email ?? "Ваш профиль уже открыт"}
          />
          {linked || canLink ? (
            <section className={styles["conversation-card"]}>
              <span>
                <ShieldCheck size={22} />
                <strong>{linked ? "Telegram подключён" : "Входить без пароля"}</strong>
              </span>
              <p>
                {linked
                  ? "В следующий раз приложение откроется сразу — пароль вводить не нужно."
                  : "Свяжите аккаунт с Telegram, и приложение будет открываться сразу."}
              </p>
              {canLink ? (
                <button
                  className={styles["journey-primary"]}
                  type="button"
                  disabled={linkStatus === "linking"}
                  onClick={() => void linkAuthenticatedAccount()}
                >
                  {linkStatus === "linking" ? "Связываем…" : "Связать с Telegram"}
                  <ArrowRight size={18} />
                </button>
              ) : null}
            </section>
          ) : null}
          {error ? <p className={styles["form-error"]} role="alert">{error}</p> : null}
          <Link className={styles["journey-primary"]} href={returnTo}>
            Продолжить <ArrowRight size={18} />
          </Link>
        </div>
      </MiniAppChrome>
    );
  }
  return (
    <MiniAppChrome data={data}>
      <div className={styles.subpage}>
        <PageHead back="/miniapp/profile" eyebrow="личное пространство" title={mode === "register" ? "Сохранить свои результаты" : "С возвращением"} description="После этого в Telegram вы будете входить автоматически. На сайте — по email и паролю." />
        <div className={styles["account-switch"]}><button type="button" className={mode === "register" ? styles["is-active"] : undefined} onClick={() => setMode("register")}><UserPlus size={17} />Новый аккаунт</button><button type="button" className={mode === "login" ? styles["is-active"] : undefined} onClick={() => setMode("login")}><SignIn size={17} />Уже есть</button></div>
        <form className={styles["account-form"]} onSubmit={submit}>
          {mode === "register" ? <label><span>Имя</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required placeholder="Как к вам обращаться" /></label> : null}
          <label><span>Email</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required placeholder="name@example.com" /></label>
          <label><span>Пароль</span><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required placeholder="Минимум 8 символов" /></label>
          {mode === "register" ? <div className={styles["consents"]}><label><input type="checkbox" checked={acceptContract} onChange={(event) => setAcceptContract(event.target.checked)} /><span>Принимаю <Link href="/legal/terms">пользовательское соглашение</Link> и <Link href="/legal/offer">оферту</Link>, подтверждаю возраст 18+</span></label><label><input type="checkbox" checked={acceptPdn} onChange={(event) => setAcceptPdn(event.target.checked)} /><span>Согласен на <Link href="/legal/consent">обработку персональных данных</Link> и ознакомлен с <Link href="/legal/privacy">политикой</Link></span></label></div> : null}
          {error ? <p className={styles["form-error"]} role="alert">{error}</p> : null}
          <button className={styles["journey-primary"]} type="submit" disabled={loading}>{loading ? "Проверяем…" : mode === "register" ? "Создать и связать" : "Войти и связать"}<ArrowRight size={18} /></button>
        </form>
        <p className={styles["flow-note"]}><ShieldCheck size={16} />Telegram используется для входа только внутри этого приложения.</p>
      </div>
    </MiniAppChrome>
  );
}

export function AccountRecoveryScreen() {
  const { data } = useMiniAppV21();
  const [email, setEmail] = useState(data.viewer.email ?? "");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Не удалось отправить письмо");
      setSent(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось отправить письмо");
    } finally {
      setLoading(false);
    }
  }

  return (
    <MiniAppChrome data={data}>
      <div className={styles.subpage}>
        <PageHead back="/miniapp/profile/security" eyebrow="безопасность" title="Восстановить пароль" description="Ссылка придёт на email аккаунта. В Telegram вы по-прежнему сможете входить автоматически." />
        {sent ? <section className={styles["conversation-card"]}><span><CheckCircle size={22} weight="fill" /><strong>Письмо отправлено</strong></span><p>Если такой аккаунт существует, в письме будет безопасная ссылка для нового пароля.</p><Link className={styles["journey-primary"]} href="/miniapp/profile/security">Готово<ArrowRight size={18} /></Link></section> : <form className={styles["account-form"]} onSubmit={submit}><label><span>Email</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required placeholder="name@example.com" /></label>{error ? <p className={styles["form-error"]} role="alert">{error}</p> : null}<button className={styles["journey-primary"]} type="submit" disabled={loading}>{loading ? "Отправляем…" : "Получить ссылку"}<ArrowRight size={18} /></button></form>}
      </div>
    </MiniAppChrome>
  );
}

export function LibraryScreen({ entries }: { entries: AnonymousLibraryEntry[] }) {
  const { data } = useMiniAppV21();
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("Все");
  const [limit, setLimit] = useState(8);
  const topics = useMemo(() => ["Все", ...Array.from(new Set(entries.map((entry) => entry.topic)))], [entries]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru");
    return entries.filter((entry) => (topic === "Все" || entry.topic === topic) && (!needle || `${entry.question} ${entry.summary}`.toLocaleLowerCase("ru").includes(needle)));
  }, [entries, query, topic]);
  const visible = filtered.slice(0, limit);

  return (
    <MiniAppChrome data={data}>
      <div className={styles.subpage}>
        <PageHead back="/miniapp/dialogues" eyebrow="библиотека вопросов" title="Найдите похожую ситуацию" description="Анонимные истории и идеи, которые уже помогли другим взглянуть на вопрос иначе." />
        <label className={styles["library-search"]}>
          <MagnifyingGlass size={18} />
          <span className={styles["sr-only"]}>Поиск по вопросам</span>
          <input value={query} onChange={(event) => { setQuery(event.target.value); setLimit(8); }} placeholder="Поиск по ситуации" type="search" />
        </label>
        <div className={styles["library-topics"]} role="group" aria-label="Категория вопроса">
          {topics.map((item) => <button key={item} type="button" aria-pressed={topic === item} onClick={() => { setTopic(item); setLimit(8); }}>{item}</button>)}
        </div>
        <p className={styles["library-count"]}>{counted(filtered.length, "история", "истории", "историй")}</p>
        {visible.length ? <div className={styles["library-list"]}>{visible.map((entry) => <Link href={`/miniapp/library/${entry.slug}`} key={entry.slug}><small>{entry.topic}</small><strong>{entry.question}</strong><span>{counted(entry.reactions, "отклик", "отклика", "откликов")} <ArrowRight size={16} /></span></Link>)}</div> : <section className={styles["empty-detail"]}><MagnifyingGlass size={28} /><strong>Ничего похожего не найдено</strong><p>Попробуйте другие слова или задайте свой вопрос.</p></section>}
        {visible.length < filtered.length ? <button className={styles["library-more"]} type="button" onClick={() => setLimit((current) => current + 8)}>Показать ещё <CaretDown size={17} /></button> : null}
        <Link className={styles["journey-primary"]} href="/miniapp/checkin">Задать свой вопрос<ArrowRight size={18} /></Link>
      </div>
    </MiniAppChrome>
  );
}

export function LibraryDetailScreen({ entry }: { entry: AnonymousLibraryEntry }) {
  const { data, share } = useMiniAppV21();
  return <MiniAppChrome data={data}><article className={styles.subpage}><PageHead back="/miniapp/library" eyebrow={entry.topic} title={entry.question} /><section className={styles["library-summary"]}><Sparkle size={23} /><p>{entry.summary}</p></section>{entry.perspectives.length ? <section className={styles["journey-section"]}><p className={styles.eyebrow}>что можно заметить</p><div className={styles["insight-list"]}>{entry.perspectives.map((item, index) => <p key={item}><span>{index + 1}</span>{item}</p>)}</div></section> : null}<div className={styles["journey-actions"]}><Link className={styles["journey-primary"]} href="/miniapp/checkin">Задать свой вопрос<ArrowRight size={18} /></Link><button className={styles["journey-secondary"]} type="button" onClick={() => share(entry.question, `/miniapp/library/${entry.slug}`)}><LinkSimple size={17} />Поделиться</button></div></article></MiniAppChrome>;
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

// «wallet» здесь нет намеренно — у кошелька собственный экран (B554 п.11).
type ProfileSection = "about" | "security" | "notifications" | "data" | "bookings" | "materials" | "invites" | "subscription";
const PROFILE_CONTENT: Record<ProfileSection, { eyebrow: string; title: string; description: string; Icon: Icon; rows: Array<{ Icon: Icon; title: string; text: string; href?: string }> }> = {
  about: { eyebrow: "профиль", title: "О себе", description: "Базовые данные и темы, которые помогают не начинать с нуля.", Icon: IdentificationCard, rows: [{ Icon: User, title: "Имя", text: "Из профиля ETerapy" }, { Icon: Notebook, title: "Темы и цели", text: "Добавление будет доступно в форме профиля" }] },
  security: { eyebrow: "настройки", title: "Безопасность", description: "Email, пароль и способы входа.", Icon: Lock, rows: [{ Icon: Password, title: "Пароль", text: "Изменяется после подтверждения email", href: "/miniapp/account/recover" }, { Icon: LinkSimple, title: "Telegram", text: "Автоматический вход внутри приложения" }, { Icon: ShieldCheck, title: "Вход с сайта", text: "По email и паролю" }] },
  notifications: { eyebrow: "настройки", title: "Уведомления", description: "Сервисные напоминания без лишних сообщений.", Icon: Bell, rows: [{ Icon: Bell, title: "Telegram", text: "Напоминания доступны после привязки" }, { Icon: CalendarBlank, title: "Записи", text: "Время встречи и изменения расписания" }] },
  data: { eyebrow: "приватность", title: "Данные и удаление", description: "Экспорт, деактивация и понятные последствия.", Icon: ShieldCheck, rows: [{ Icon: DownloadSimple, title: "Экспорт данных", text: "Собрать архив аккаунта", href: "/api/auth/export-data" }, { Icon: Trash, title: "Деактивация", text: "Требует отдельного подтверждения" }] },
  bookings: { eyebrow: "встречи", title: "Мои записи", description: "Будущие и завершённые встречи со специалистами.", Icon: CalendarBlank, rows: [{ Icon: CalendarBlank, title: "Ближайшая запись", text: "Появится после подтверждения бронирования" }, { Icon: Users, title: "Выбрать специалиста", text: "Открыть каталог", href: "/miniapp/practitioners" }] },
  materials: { eyebrow: "после встречи", title: "Материалы", description: "Задания и файлы, которые отправил специалист.", Icon: FileText, rows: [{ Icon: FileText, title: "Новых материалов нет", text: "Здесь не будет общего чата — только полезные артефакты" }] },
  // B554 п.11: «Кошелёк» больше не заглушка в этом реестре — он рендерится
  // отдельным экраном с реальным балансом (см. app/miniapp/profile/[section]).
  invites: { eyebrow: "приглашения", title: "Пригласить друга", description: "Друг получает свой первый шаг, ваши данные не раскрываются.", Icon: Gift, rows: [{ Icon: Gift, title: "Личная ссылка", text: "Будет создана для вашего аккаунта" }, { Icon: ShieldCheck, title: "Приватность", text: "Чужие вопросы и результаты не связываются" }] },
  subscription: { eyebrow: "тариф", title: "Моя подписка", description: "Текущий план и варианты без скрытого переключения.", Icon: CrownSimple, rows: [{ Icon: CrownSimple, title: "Текущий план", text: "Статус показан в профиле" }, { Icon: Wallet, title: "Сравнить варианты", text: "Открыть тарифы", href: "/miniapp/packages" }] },
};

export function ProfileSectionScreen({ section }: { section: ProfileSection }) {
  const { data } = useMiniAppV21();
  const content = PROFILE_CONTENT[section];
  const HeaderIcon = content.Icon;
  if (section === "bookings") {
    return <MiniAppChrome data={data}><div className={styles.subpage}><PageHead back="/miniapp/profile" eyebrow="встречи" title="Мои записи" description="Действующие и завершённые записи из вашего аккаунта." />{data.bookings.length ? <div className={styles["profile-detail-list"]}>{data.bookings.map((booking) => <article key={booking.id}><span><CalendarBlank size={20} /></span><div><small>{booking.status}</small><strong>{booking.practitioner}</strong><p>{booking.date} · {booking.price}</p></div>{booking.canJoin ? <Link href={`/miniapp/session/${booking.id}`}><VideoCamera size={17} />Войти</Link> : null}</article>)}</div> : <section className={styles["empty-detail"]}><CalendarBlank size={28} /><strong>Записей пока нет</strong><p>Выберите специалиста и удобное время — без обязательств до подтверждения.</p></section>}<Link className={styles["journey-primary"]} href="/miniapp/practitioners">Выбрать специалиста<ArrowRight size={18} /></Link></div></MiniAppChrome>;
  }
  if (section === "materials") {
    return <MiniAppChrome data={data}><div className={styles.subpage}><PageHead back="/miniapp/profile" eyebrow="после встречи" title="Материалы" description="Задания и заметки от специалиста. Это не общий чат — ответить можно на следующей встрече." />{data.materials.length ? <div className={styles["profile-detail-list"]}>{data.materials.map((material) => <Link key={material.id} href={`/miniapp/materials/${material.id}`} className={material.unread ? styles["is-unread"] : undefined}><span><FileText size={20} /></span><div><small>{material.practitioner} · {material.date}</small><strong>{material.preview}</strong>{material.attachmentName ? <p><Paperclip size={13} />{material.attachmentName}</p> : null}</div><CaretRight size={18} /></Link>)}</div> : <section className={styles["empty-detail"]}><FileText size={28} /><strong>Новых материалов нет</strong><p>После сессии специалист сможет оставить здесь задание или полезный файл.</p></section>}</div></MiniAppChrome>;
  }
  const returnTo = encodeURIComponent(`/miniapp/profile/${section}`);
  return <MiniAppChrome data={data}><div className={styles.subpage}><PageHead back="/miniapp/profile" eyebrow={content.eyebrow} title={content.title} description={content.description} /><section className={styles["settings-hero"]}><HeaderIcon size={27} /><div><small>ВАШ ПРОФИЛЬ</small><strong>{section === "subscription" ? data.viewer.plan : data.viewer.email ?? "Гостевой режим"}</strong></div></section><div className={styles["settings-list"]}>{content.rows.map(({ Icon: RowIcon, title, text, href }) => { const body = <><span><RowIcon size={19} /></span><span><strong>{title}</strong><small>{text}</small></span>{href ? <CaretRight size={18} /> : null}</>; return href ? <Link href={href} key={title}>{body}</Link> : <div key={title}>{body}</div>; })}</div>{!data.viewer.authenticated ? <GateLink href={`/miniapp/account?mode=login&intent=settings&returnTo=${returnTo}`}>Войти, чтобы управлять</GateLink> : null}</div></MiniAppChrome>;
}

// B565: `HelpScreen` («Коротко о главном» — четыре статические строки и
// `mailto:`) снят. База знаний переехала на `/miniapp/faq`
// (`screens/faq-screen.tsx`), поддержка — на `/miniapp/support`
// (`screens/support-screen.tsx`, вебовые механики поиска и обращений).
