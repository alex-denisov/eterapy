"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Bell, CaretDown, CaretLeft, CheckCircle, Copy, DownloadSimple, Envelope, LinkSimple, Lock, ShieldCheck, Trash, User } from "@phosphor-icons/react";
import { MiniAppChrome, useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { styles } from "@/components/miniapp/styles";
import { maskDateInput } from "@/lib/date-input-mask";

function Head({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className={styles["subpage-head"]}><div className={styles["subpage-title-row"]}><Link href="/miniapp/profile" className={styles["subpage-back"]} aria-label="Назад"><CaretLeft size={21} /><span className={styles["sr-only"]}>Назад</span></Link><div><p className={styles.eyebrow}>{eyebrow}</p><h1>{title}</h1></div></div><p>{description}</p></header>;
}

function GuestGate() {
  return <Link className={styles["journey-primary"]} href="/miniapp/account?mode=login&intent=settings&returnTo=%2Fminiapp%2Fprofile">Войти в аккаунт<ArrowRight size={18} /></Link>;
}

// B554 п.9/12/15: любой сбой сводился к одной строке про сохранение — даже когда
// падала ЗАГРУЗКА и пользователь ничего не сохранял. Истёкшая сессия при этом
// выглядела как поломка сервиса, и выйти из неё было нечем. Различаем причины и
// всегда даём следующий шаг.
type RequestFailure = { message: string; expired: boolean };
type RequestResult<T> = { ok: true; data: T } | { ok: false; failure: RequestFailure };

async function requestJson<T>(input: string, init?: RequestInit): Promise<RequestResult<T>> {
  try {
    const response = await fetch(input, init);
    if (response.status === 401 || response.status === 403) {
      return { ok: false, failure: { message: "Сессия истекла. Войдите в аккаунт ещё раз.", expired: true } };
    }
    if (!response.ok) {
      return { ok: false, failure: { message: "Сервис сейчас недоступен. Попробуйте ещё раз.", expired: false } };
    }
    return { ok: true, data: await response.json() as T };
  } catch {
    return { ok: false, failure: { message: "Нет связи с сервером. Проверьте интернет.", expired: false } };
  }
}

function FailureNote({ failure, onRetry }: { failure: RequestFailure; onRetry?: () => void }) {
  return (
    <>
      <p className={styles["form-error"]}>{failure.message}</p>
      {failure.expired ? <GuestGate /> : onRetry ? <button className={styles["journey-secondary"]} type="button" onClick={onRetry}>Повторить</button> : null}
    </>
  );
}

// B554 п.13: в мини-аппе «О себе» состояло из имени и read-only email, тогда как
// в вебе это ещё и данные рождения, семейное положение, занятие и темы, ради
// которых персонализация вообще существует. Поля и справочники — те же, что в
// `cabinet/settings`, эндпоинт тот же (`/api/auth/extended-profile`).
const GOALS = [
  { value: "relationships", label: "Отношения" },
  { value: "career", label: "Карьера" },
  { value: "selfdev", label: "Саморазвитие" },
  { value: "health", label: "Здоровье" },
  { value: "finance", label: "Финансы" },
  { value: "family", label: "Семья" },
  { value: "creativity", label: "Творчество" },
  { value: "spirituality", label: "Духовность" },
];

const MARITAL_OPTIONS = [
  { value: "single", label: "Не состою в отношениях" },
  { value: "dating", label: "В отношениях" },
  { value: "married", label: "Женат/замужем" },
  { value: "divorced", label: "В разводе" },
  { value: "widowed", label: "Вдовец/вдова" },
];

type ExtendedProfile = {
  birthDate?: string | null;
  birthTime?: string | null;
  birthPlace?: string | null;
  maritalStatus?: string | null;
  occupation?: string | null;
  aiGoals?: string[] | null;
};

/** «1990-05-11» с сервера → «11.05.1990» в поле. */
function isoToDotted(iso: string | null | undefined): string {
  if (!iso) return "";
  const parts = iso.split("-");
  return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : "";
}

export function MiniAppAboutSettingsScreen() {
  const { data } = useMiniAppV21();
  const router = useRouter();
  const [name, setName] = useState(data.viewer.firstName === "Гость" ? "" : data.viewer.firstName);
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [maritalStatus, setMaritalStatus] = useState("");
  const [occupation, setOccupation] = useState("");
  const [aiGoals, setAiGoals] = useState<string[]>([]);
  const [state, setState] = useState<"loading" | "idle" | "saving" | "saved">("loading");
  const [failure, setFailure] = useState<RequestFailure | null>(null);

  const load = useCallback(async () => {
    setState("loading"); setFailure(null);
    const result = await requestJson<{ profile?: ExtendedProfile | null }>("/api/auth/extended-profile");
    if (!result.ok) { setFailure(result.failure); setState("idle"); return; }
    const profile = result.data.profile;
    if (profile) {
      setBirthDate(isoToDotted(profile.birthDate));
      setBirthTime(profile.birthTime ?? "");
      setBirthPlace(profile.birthPlace ?? "");
      setMaritalStatus(profile.maritalStatus ?? "");
      setOccupation(profile.occupation ?? "");
      setAiGoals(Array.isArray(profile.aiGoals) ? profile.aiGoals : []);
    }
    setState("idle");
  }, []);

  // Профиль подтягивается с сервера один раз на маунте — обращение к внешней
  // системе, состояние «загружаем» ставится тем же вызовом, что и на «Повторить».
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (data.viewer.authenticated) void load(); }, [data.viewer.authenticated, load]);

  function toggleGoal(value: string) {
    setAiGoals((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setState("saving"); setFailure(null);
    // B554: без catch оборванная мобильная сеть оставляла кнопку в «Сохраняем…»
    // навсегда — выйти можно было только перезапуском приложения.
    try {
      const formData = new FormData(); formData.append("name", name.trim());
      const nameResponse = await fetch("/api/auth/update-profile", { method: "POST", body: formData });
      if (!nameResponse.ok) {
        setFailure({ message: "Не удалось сохранить имя. Проверьте его и попробуйте ещё раз.", expired: nameResponse.status === 401 });
        setState("idle");
        return;
      }
    } catch {
      setFailure({ message: "Нет связи с сервером. Проверьте интернет.", expired: false });
      setState("idle");
      return;
    }

    const profileResult = await requestJson<{ ok?: boolean; error?: string }>("/api/auth/extended-profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ birthDate: birthDate.trim(), birthTime: birthTime.trim(), birthPlace: birthPlace.trim(), maritalStatus, occupation: occupation.trim(), aiGoals }),
    });
    if (!profileResult.ok) { setFailure(profileResult.failure); setState("idle"); return; }
    setState("saved");
    router.refresh();
  }

  return <MiniAppChrome data={data}><div className={styles.subpage}><Head eyebrow="профиль" title="О себе" description="Имя видно только вам и специалистам, с которыми вы работаете. Остальное помогает разборам не начинать с нуля — можно заполнить частично." />{!data.viewer.authenticated ? <GuestGate /> : state === "loading" ? <p className={styles["flow-note"]}>Загружаем профиль…</p> : <form className={styles["account-form"]} onSubmit={submit}>
    <label><span>Имя</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required maxLength={50} /></label>
    <label><span>Email</span><input value={data.viewer.email ?? ""} readOnly aria-readonly="true" /></label>
    <label><span>Дата рождения</span><input value={birthDate} inputMode="numeric" placeholder="11.05.1990" onChange={(event) => setBirthDate(maskDateInput(event.target.value.slice(0, 10), birthDate))} /></label>
    <label><span>Время рождения</span><input value={birthTime} type="time" onChange={(event) => setBirthTime(event.target.value)} /></label>
    <label><span>Место рождения</span><input value={birthPlace} placeholder="Москва" maxLength={100} onChange={(event) => setBirthPlace(event.target.value)} /></label>
    <label><span>Чем занимаетесь</span><input value={occupation} placeholder="Например, врач" maxLength={100} onChange={(event) => setOccupation(event.target.value)} /></label>
    <fieldset className={styles["profile-choice"]}><legend>Семейное положение</legend><div>{MARITAL_OPTIONS.map((option) => <button key={option.value} type="button" aria-pressed={maritalStatus === option.value} className={maritalStatus === option.value ? styles["is-selected"] : undefined} onClick={() => setMaritalStatus(maritalStatus === option.value ? "" : option.value)}>{option.label}</button>)}</div></fieldset>
    <fieldset className={styles["profile-choice"]}><legend>Темы, которые важны</legend><div>{GOALS.map((goal) => <button key={goal.value} type="button" aria-pressed={aiGoals.includes(goal.value)} className={aiGoals.includes(goal.value) ? styles["is-selected"] : undefined} onClick={() => toggleGoal(goal.value)}>{goal.label}</button>)}</div></fieldset>
    {failure ? <FailureNote failure={failure} onRetry={() => void load()} /> : null}
    <button className={styles["journey-primary"]} type="submit" disabled={state === "saving"}>{state === "saving" ? "Сохраняем…" : state === "saved" ? "Сохранено" : "Сохранить"}<CheckCircle size={18} /></button>
  </form>}</div></MiniAppChrome>;
}

export function MiniAppSecuritySettingsScreen() {
  const { data } = useMiniAppV21();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage("");
    if (newPassword.length < 8 || newPassword !== confirmPassword) return setMessage(newPassword.length < 8 ? "Нужно минимум 8 символов" : "Пароли не совпадают");
    setSaving(true);
    try {
      const response = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      const payload = await response.json().catch(() => ({})) as { error?: string; ok?: boolean };
      setMessage(response.ok && payload.ok ? "Пароль изменён" : payload.error ?? "Не удалось изменить пароль");
      if (response.ok) { setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); }
    } catch {
      setMessage("Нет связи с сервером. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  }
  return <MiniAppChrome data={data}><div className={styles.subpage}><Head eyebrow="безопасность" title="Способы входа" description="В Telegram вы входите автоматически. Email и пароль позволяют открыть тот же аккаунт на сайте." />{data.viewer.authenticated ? <><section className={styles["settings-hero"]}><ShieldCheck size={23} /><div>{/* B554 п.14: строка «Telegram подключится при запуске из бота» не объясняла
    ни текущего состояния, ни что делать. Пишем прямо: подключён или нет, и
    что это даёт. */}<small>ВХОД ЧЕРЕЗ TELEGRAM</small><strong>{data.viewer.telegramLinked ? "Подключён" : "Пока не подключён"}</strong><p>{data.viewer.telegramLinked ? "Приложение узнаёт вас при открытии из бота — пароль вводить не нужно." : "Откройте приложение из бота ETerapy — вход свяжется с этим аккаунтом автоматически."}</p></div></section>{data.viewer.hasPassword ? <><form className={styles["account-form"]} onSubmit={submit}><label><span>Текущий пароль</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label><label><span>Новый пароль</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required minLength={8} /></label><label><span>Повторите новый пароль</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required minLength={8} /></label>{message ? <p className={message === "Пароль изменён" ? styles["flow-note"] : styles["form-error"]}>{message}</p> : null}<button className={styles["journey-primary"]} type="submit" disabled={saving}>{saving ? "Сохраняем…" : "Изменить пароль"}<Lock size={18} /></button></form><Link className={styles["journey-secondary"]} href="/miniapp/account/recover">Не помню текущий пароль</Link></> : <section className={styles["password-setup"]}><div><Lock size={19} /><span><strong>Пароль ещё не создан</strong><small>Добавьте его, если хотите входить в ETerapy через сайт.</small></span></div><Link href="/miniapp/account/recover">Создать пароль<ArrowRight size={16} /></Link></section>}</> : <GuestGate />}</div></MiniAppChrome>;
}

type Pref = { event: string; category?: string; label?: string; description?: string; channel: "EMAIL" | "TELEGRAM" | "WEB"; enabled: boolean; remindBeforeHours: Array<number | null> };
type QuietHours = { enabled: boolean; from: string; to: string; timezone: string };

export function MiniAppNotificationSettingsScreen() {
  const { data } = useMiniAppV21();
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [quiet, setQuiet] = useState<QuietHours>({ enabled: false, from: "22:00", to: "09:00", timezone: "Europe/Moscow" });
  const [state, setState] = useState<"loading" | "idle" | "saving" | "saved">("loading");
  const [loadFailure, setLoadFailure] = useState<RequestFailure | null>(null);
  const [saveFailure, setSaveFailure] = useState<RequestFailure | null>(null);
  const load = useCallback(async () => {
    setState("loading"); setLoadFailure(null);
    const result = await requestJson<{ prefs?: Pref[]; quietHours?: QuietHours }>("/api/notifications/preferences");
    if (!result.ok) { setLoadFailure(result.failure); setState("idle"); return; }
    setPrefs(result.data.prefs ?? []);
    if (result.data.quietHours) setQuiet(result.data.quietHours);
    setState("idle");
  }, []);
  // Первая загрузка настроек — обращение к внешней системе на маунте; состояние
  // «загружаем» выставляется тем же вызовом, что и на кнопке «Повторить».
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (data.viewer.authenticated) void load(); }, [data.viewer.authenticated, load]);
  const channelState = useMemo(() => Object.fromEntries((["EMAIL", "TELEGRAM", "WEB"] as const).map((channel) => [channel, prefs.filter((pref) => pref.channel === channel).some((pref) => pref.enabled)])), [prefs]);
  const eventPrefs = useMemo(() => Array.from(new Map(prefs.map((pref) => [pref.event, pref])).values()), [prefs]);
  function toggle(channel: Pref["channel"]) { const enabled = !channelState[channel]; setPrefs((current) => current.map((pref) => pref.channel === channel ? { ...pref, enabled } : pref)); }
  function toggleEvent(event: string) {
    const enabled = !prefs.some((pref) => pref.event === event && pref.enabled);
    const activeChannels = (["EMAIL", "TELEGRAM", "WEB"] as const).filter((channel) => channelState[channel]);
    const targets: readonly Pref["channel"][] = activeChannels.length ? activeChannels : ["WEB"];
    setPrefs((current) => current.map((pref) => pref.event === event ? { ...pref, enabled: enabled && targets.includes(pref.channel) } : pref));
  }
  async function save() {
    setState("saving"); setSaveFailure(null);
    const result = await requestJson<{ ok?: boolean }>("/api/notifications/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefs, quietHours: quiet }) });
    if (!result.ok) { setSaveFailure(result.failure); setState("idle"); return; }
    setState("saved");
  }
  return <MiniAppChrome data={data}><div className={styles.subpage}><Head eyebrow="уведомления" title="Что сообщать" description="Выберите каналы. Список событий можно настроить отдельно, если нужен более точный контроль." />{!data.viewer.authenticated ? <GuestGate /> : state === "loading" ? <p className={styles["flow-note"]}>Загружаем настройки…</p> : loadFailure ? <FailureNote failure={loadFailure} onRetry={() => void load()} /> : <><div className={styles["native-toggle-list"]}>{([{ id: "TELEGRAM", title: "Telegram", text: "Записи, результаты и изменения", Icon: Bell }, { id: "EMAIL", title: "Email", text: "Доступ, документы и платежи", Icon: Envelope }, { id: "WEB", title: "Внутри приложения", text: "Новые события в Профиле", Icon: User }] as const).map(({ id, title, text, Icon }) => <button key={id} type="button" role="switch" aria-checked={Boolean(channelState[id])} onClick={() => toggle(id)}><span><Icon size={19} /></span><span><strong>{title}</strong><small>{text}</small></span><i aria-hidden="true" /></button>)}</div><details className={styles["event-settings"]}><summary>Какие события присылать <span>{eventPrefs.filter((pref) => prefs.some((item) => item.event === pref.event && item.enabled)).length} включено</span><CaretDown size={17} /></summary><div>{eventPrefs.map((pref) => { const enabled = prefs.some((item) => item.event === pref.event && item.enabled); return <button key={pref.event} type="button" role="switch" aria-checked={enabled} onClick={() => toggleEvent(pref.event)}><span><strong>{pref.label ?? pref.event}</strong><small>{pref.description ?? "Уведомление о важном изменении"}</small></span><i aria-hidden="true" /></button>; })}</div></details><section className={styles["quiet-hours"]}><label><input type="checkbox" checked={quiet.enabled} onChange={(event) => setQuiet({ ...quiet, enabled: event.target.checked })} /><span><strong>Тихие часы</strong><small>Не присылать сервисные напоминания ночью</small></span></label>{quiet.enabled ? <div><input type="time" value={quiet.from} onChange={(event) => setQuiet({ ...quiet, from: event.target.value })} aria-label="Начало тихих часов" /><span>—</span><input type="time" value={quiet.to} onChange={(event) => setQuiet({ ...quiet, to: event.target.value })} aria-label="Конец тихих часов" /></div> : null}</section>{saveFailure ? <FailureNote failure={saveFailure} /> : null}<button className={styles["journey-primary"]} type="button" onClick={save} disabled={state === "saving"}>{state === "saving" ? "Сохраняем…" : state === "saved" ? "Сохранено" : "Сохранить настройки"}<CheckCircle size={18} /></button></>}</div></MiniAppChrome>;
}

export function MiniAppDataSettingsScreen() {
  const { data } = useMiniAppV21();
  const [confirmEmail, setConfirmEmail] = useState("");
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportFailure, setExportFailure] = useState<RequestFailure | null>(null);
  // B554 п.15: архив открывался обычной ссылкой, поэтому при истёкшей сессии
  // пользователь просто проваливался на белый экран со словом «Unauthorized».
  // Забираем файл запросом, чтобы про ошибку можно было сказать по-человечески,
  // а сам файл сохранялся и внутри Telegram-вебвью.
  async function exportArchive() {
    setExporting(true); setExportFailure(null);
    try {
      const response = await fetch("/api/auth/export-data");
      if (response.status === 401 || response.status === 403) {
        setExportFailure({ message: "Сессия истекла. Войдите в аккаунт ещё раз.", expired: true });
        return;
      }
      if (!response.ok) {
        setExportFailure({ message: "Не удалось собрать архив. Попробуйте позже.", expired: false });
        return;
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = "eterapy-personal-data.json";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch {
      setExportFailure({ message: "Нет связи с сервером. Проверьте интернет.", expired: false });
    } finally {
      setExporting(false);
    }
  }
  async function deactivate() {
    if (!data.viewer.email || confirmEmail !== data.viewer.email) return setMessage("Введите email аккаунта полностью");
    try {
      const response = await fetch("/api/auth/deactivate", { method: "POST" });
      if (response.ok) window.location.href = "/api/auth/logout?callbackUrl=/miniapp";
      else setMessage("Не удалось деактивировать аккаунт");
    } catch {
      setMessage("Нет связи с сервером. Попробуйте ещё раз.");
    }
  }
  return <MiniAppChrome data={data}><div className={styles.subpage}><Head eyebrow="приватность" title="Ваши данные" description="Экспорт не удаляет данные. Деактивация — отдельное подтверждаемое действие." />{data.viewer.authenticated ? <><button className={styles["journey-secondary"]} type="button" onClick={exportArchive} disabled={exporting}><DownloadSimple size={18} />{exporting ? "Собираем архив…" : "Скачать архив данных"}</button>{exportFailure ? <FailureNote failure={exportFailure} /> : null}<section className={styles["danger-zone"]}><Trash size={22} /><div><strong>Деактивировать аккаунт</strong><p>Введите {data.viewer.email}, чтобы подтвердить действие.</p><input value={confirmEmail} onChange={(event) => setConfirmEmail(event.target.value)} type="email" placeholder="Email аккаунта" />{message ? <small>{message}</small> : null}<button type="button" onClick={deactivate}>Деактивировать</button></div></section></> : <GuestGate />}</div></MiniAppChrome>;
}

export function MiniAppInvitesScreen() {
  const { data, share } = useMiniAppV21();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<RequestFailure | null>(null);
  const [copied, setCopied] = useState(false);
  async function createLink() {
    setLoading(true); setFailure(null);
    const result = await requestJson<{ url?: string }>("/api/referral/link", { method: "POST" });
    setLoading(false);
    if (!result.ok) return setFailure(result.failure);
    if (!result.data.url) return setFailure({ message: "Сервис сейчас недоступен. Попробуйте ещё раз.", expired: false });
    setUrl(result.data.url);
  }
  // B554 п.12: копирование молча ничего не отвечало, а в Telegram-вебвью
  // clipboard-запрос ещё и отклоняется — тогда показываем саму ссылку.
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailure({ message: "Не удалось скопировать. Ссылку можно выделить и скопировать вручную.", expired: false });
    }
  }
  return <MiniAppChrome data={data}><div className={styles.subpage}><Head eyebrow="приглашения" title="Пригласить друга" description="Друг получит свой первый разбор. Ваши вопросы, результаты и аккаунты не связываются." />{!data.viewer.authenticated ? <GuestGate /> : <><section className={styles["invite-native-card"]}><LinkSimple size={24} /><strong>{url ? "Личная ссылка готова" : "Подарить первый разбор"}</strong><p>{url || "Создадим безопасную ссылку без ваших личных данных."}</p>{url ? <div><button type="button" onClick={copyLink}><Copy size={17} />{copied ? "Скопировано" : "Скопировать"}</button><button type="button" onClick={() => share("Попробовать ETerapy", url)}><ArrowRight size={17} />Поделиться</button></div> : <button type="button" onClick={createLink} disabled={loading}>{loading ? "Создаём…" : "Создать ссылку"}</button>}</section>{failure ? <FailureNote failure={failure} onRetry={url ? undefined : () => void createLink()} /> : null}<p className={styles["flow-note"]}><ShieldCheck size={16} />Реферальная ссылка не раскрывает содержимое Дневника.</p></>}</div></MiniAppChrome>;
}
