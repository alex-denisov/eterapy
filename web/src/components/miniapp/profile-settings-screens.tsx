"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Bell, CaretDown, CaretLeft, CheckCircle, Copy, DownloadSimple, Envelope, LinkSimple, Lock, ShieldCheck, Trash, User } from "@phosphor-icons/react";
import { MiniAppChrome, useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { styles } from "@/components/miniapp/styles";

function Head({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className={styles["subpage-head"]}><div className={styles["subpage-title-row"]}><Link href="/miniapp/profile" className={styles["subpage-back"]} aria-label="Назад"><CaretLeft size={21} /><span className={styles["sr-only"]}>Назад</span></Link><div><p className={styles.eyebrow}>{eyebrow}</p><h1>{title}</h1></div></div><p>{description}</p></header>;
}

function GuestGate() {
  return <Link className={styles["journey-primary"]} href="/miniapp/account?mode=login&intent=settings&returnTo=%2Fminiapp%2Fprofile">Войти в аккаунт<ArrowRight size={18} /></Link>;
}

export function MiniAppAboutSettingsScreen() {
  const { data } = useMiniAppV21();
  const router = useRouter();
  const [name, setName] = useState(data.viewer.firstName === "Гость" ? "" : data.viewer.firstName);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  async function submit(event: FormEvent) {
    event.preventDefault(); setState("saving");
    const formData = new FormData(); formData.append("name", name.trim());
    const response = await fetch("/api/auth/update-profile", { method: "POST", body: formData });
    setState(response.ok ? "saved" : "error");
    if (response.ok) router.refresh();
  }
  return <MiniAppChrome data={data}><div className={styles.subpage}><Head eyebrow="профиль" title="О себе" description="Имя видно только вам и специалистам, с которыми вы работаете. Email нужен для входа с сайта и восстановления доступа." />{data.viewer.authenticated ? <form className={styles["account-form"]} onSubmit={submit}><label><span>Имя</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required maxLength={50} /></label><label><span>Email</span><input value={data.viewer.email ?? ""} readOnly aria-readonly="true" /></label>{state === "error" ? <p className={styles["form-error"]}>Не удалось сохранить. Проверьте имя и попробуйте ещё раз.</p> : null}<button className={styles["journey-primary"]} type="submit" disabled={state === "saving"}>{state === "saving" ? "Сохраняем…" : state === "saved" ? "Сохранено" : "Сохранить"}<CheckCircle size={18} /></button></form> : <GuestGate />}</div></MiniAppChrome>;
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
    const response = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
    const payload = await response.json().catch(() => ({})) as { error?: string; ok?: boolean };
    setMessage(response.ok && payload.ok ? "Пароль изменён" : payload.error ?? "Не удалось изменить пароль");
    if (response.ok) { setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); }
    setSaving(false);
  }
  return <MiniAppChrome data={data}><div className={styles.subpage}><Head eyebrow="безопасность" title="Способы входа" description="В Telegram вы входите автоматически. Email и пароль позволяют открыть тот же аккаунт на сайте." />{data.viewer.authenticated ? <><section className={styles["settings-hero"]}><ShieldCheck size={23} /><div><small>ВХОД В ПРИЛОЖЕНИЕ</small><strong>{data.viewer.telegramLinked ? "Telegram подключён" : "Telegram подключится при запуске из бота"}</strong><p>{data.viewer.telegramLinked ? "При следующем открытии вводить пароль не понадобится." : "Ваши данные останутся в этом же аккаунте."}</p></div></section>{data.viewer.hasPassword ? <><form className={styles["account-form"]} onSubmit={submit}><label><span>Текущий пароль</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label><label><span>Новый пароль</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required minLength={8} /></label><label><span>Повторите новый пароль</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required minLength={8} /></label>{message ? <p className={message === "Пароль изменён" ? styles["flow-note"] : styles["form-error"]}>{message}</p> : null}<button className={styles["journey-primary"]} type="submit" disabled={saving}>{saving ? "Сохраняем…" : "Изменить пароль"}<Lock size={18} /></button></form><Link className={styles["journey-secondary"]} href="/miniapp/account/recover">Не помню текущий пароль</Link></> : <section className={styles["password-setup"]}><div><Lock size={19} /><span><strong>Пароль ещё не создан</strong><small>Добавьте его, если хотите входить в ETerapy через сайт.</small></span></div><Link href="/miniapp/account/recover">Создать пароль<ArrowRight size={16} /></Link></section>}</> : <GuestGate />}</div></MiniAppChrome>;
}

type Pref = { event: string; category?: string; label?: string; description?: string; channel: "EMAIL" | "TELEGRAM" | "WEB"; enabled: boolean; remindBeforeHours: Array<number | null> };
type QuietHours = { enabled: boolean; from: string; to: string; timezone: string };

export function MiniAppNotificationSettingsScreen() {
  const { data } = useMiniAppV21();
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [quiet, setQuiet] = useState<QuietHours>({ enabled: false, from: "22:00", to: "09:00", timezone: "Europe/Moscow" });
  const [state, setState] = useState<"loading" | "idle" | "saving" | "saved" | "error">("loading");
  useEffect(() => { if (!data.viewer.authenticated) return; fetch("/api/notifications/preferences").then((response) => response.json()).then((payload) => { setPrefs(payload.prefs ?? []); if (payload.quietHours) setQuiet(payload.quietHours); setState("idle"); }).catch(() => setState("error")); }, [data.viewer.authenticated]);
  const channelState = useMemo(() => Object.fromEntries((["EMAIL", "TELEGRAM", "WEB"] as const).map((channel) => [channel, prefs.filter((pref) => pref.channel === channel).some((pref) => pref.enabled)])), [prefs]);
  const eventPrefs = useMemo(() => Array.from(new Map(prefs.map((pref) => [pref.event, pref])).values()), [prefs]);
  function toggle(channel: Pref["channel"]) { const enabled = !channelState[channel]; setPrefs((current) => current.map((pref) => pref.channel === channel ? { ...pref, enabled } : pref)); }
  function toggleEvent(event: string) {
    const enabled = !prefs.some((pref) => pref.event === event && pref.enabled);
    const activeChannels = (["EMAIL", "TELEGRAM", "WEB"] as const).filter((channel) => channelState[channel]);
    const targets: readonly Pref["channel"][] = activeChannels.length ? activeChannels : ["WEB"];
    setPrefs((current) => current.map((pref) => pref.event === event ? { ...pref, enabled: enabled && targets.includes(pref.channel) } : pref));
  }
  async function save() { setState("saving"); const response = await fetch("/api/notifications/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefs, quietHours: quiet }) }); setState(response.ok ? "saved" : "error"); }
  return <MiniAppChrome data={data}><div className={styles.subpage}><Head eyebrow="уведомления" title="Что сообщать" description="Выберите каналы. Список событий можно настроить отдельно, если нужен более точный контроль." />{!data.viewer.authenticated ? <GuestGate /> : state === "loading" ? <p className={styles["flow-note"]}>Загружаем настройки…</p> : <><div className={styles["native-toggle-list"]}>{([{ id: "TELEGRAM", title: "Telegram", text: "Записи, результаты и изменения", Icon: Bell }, { id: "EMAIL", title: "Email", text: "Доступ, документы и платежи", Icon: Envelope }, { id: "WEB", title: "Внутри приложения", text: "Новые события в Профиле", Icon: User }] as const).map(({ id, title, text, Icon }) => <button key={id} type="button" role="switch" aria-checked={Boolean(channelState[id])} onClick={() => toggle(id)}><span><Icon size={19} /></span><span><strong>{title}</strong><small>{text}</small></span><i aria-hidden="true" /></button>)}</div><details className={styles["event-settings"]}><summary>Какие события присылать <span>{eventPrefs.filter((pref) => prefs.some((item) => item.event === pref.event && item.enabled)).length} включено</span><CaretDown size={17} /></summary><div>{eventPrefs.map((pref) => { const enabled = prefs.some((item) => item.event === pref.event && item.enabled); return <button key={pref.event} type="button" role="switch" aria-checked={enabled} onClick={() => toggleEvent(pref.event)}><span><strong>{pref.label ?? pref.event}</strong><small>{pref.description ?? "Уведомление о важном изменении"}</small></span><i aria-hidden="true" /></button>; })}</div></details><section className={styles["quiet-hours"]}><label><input type="checkbox" checked={quiet.enabled} onChange={(event) => setQuiet({ ...quiet, enabled: event.target.checked })} /><span><strong>Тихие часы</strong><small>Не присылать сервисные напоминания ночью</small></span></label>{quiet.enabled ? <div><input type="time" value={quiet.from} onChange={(event) => setQuiet({ ...quiet, from: event.target.value })} aria-label="Начало тихих часов" /><span>—</span><input type="time" value={quiet.to} onChange={(event) => setQuiet({ ...quiet, to: event.target.value })} aria-label="Конец тихих часов" /></div> : null}</section>{state === "error" ? <p className={styles["form-error"]}>Не удалось сохранить настройки.</p> : null}<button className={styles["journey-primary"]} type="button" onClick={save} disabled={state === "saving"}>{state === "saving" ? "Сохраняем…" : state === "saved" ? "Сохранено" : "Сохранить настройки"}<CheckCircle size={18} /></button></>}</div></MiniAppChrome>;
}

export function MiniAppDataSettingsScreen() {
  const { data } = useMiniAppV21();
  const [confirmEmail, setConfirmEmail] = useState("");
  const [message, setMessage] = useState("");
  async function deactivate() {
    if (!data.viewer.email || confirmEmail !== data.viewer.email) return setMessage("Введите email аккаунта полностью");
    const response = await fetch("/api/auth/deactivate", { method: "POST" });
    if (response.ok) window.location.href = "/api/auth/logout?callbackUrl=/miniapp";
    else setMessage("Не удалось деактивировать аккаунт");
  }
  return <MiniAppChrome data={data}><div className={styles.subpage}><Head eyebrow="приватность" title="Ваши данные" description="Экспорт не удаляет данные. Деактивация — отдельное подтверждаемое действие." />{data.viewer.authenticated ? <><Link className={styles["journey-secondary"]} href="/api/auth/export-data" prefetch={false}><DownloadSimple size={18} />Скачать архив данных</Link><section className={styles["danger-zone"]}><Trash size={22} /><div><strong>Деактивировать аккаунт</strong><p>Введите {data.viewer.email}, чтобы подтвердить действие.</p><input value={confirmEmail} onChange={(event) => setConfirmEmail(event.target.value)} type="email" placeholder="Email аккаунта" />{message ? <small>{message}</small> : null}<button type="button" onClick={deactivate}>Деактивировать</button></div></section></> : <GuestGate />}</div></MiniAppChrome>;
}

export function MiniAppInvitesScreen() {
  const { data, share } = useMiniAppV21();
  const [url, setUrl] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  async function createLink() { setState("loading"); const response = await fetch("/api/referral/link", { method: "POST" }); const payload = await response.json().catch(() => ({})) as { url?: string }; if (response.ok && payload.url) { setUrl(payload.url); setState("idle"); } else setState("error"); }
  return <MiniAppChrome data={data}><div className={styles.subpage}><Head eyebrow="приглашения" title="Пригласить друга" description="Друг получит свой первый разбор. Ваши вопросы, результаты и аккаунты не связываются." />{!data.viewer.authenticated ? <GuestGate /> : <><section className={styles["invite-native-card"]}><LinkSimple size={24} /><strong>{url ? "Личная ссылка готова" : "Подарить первый разбор"}</strong><p>{url || "Создадим безопасную ссылку без ваших личных данных."}</p>{url ? <div><button type="button" onClick={() => navigator.clipboard.writeText(url)}><Copy size={17} />Скопировать</button><button type="button" onClick={() => share("Попробовать ETerapy", url)}><ArrowRight size={17} />Поделиться</button></div> : <button type="button" onClick={createLink} disabled={state === "loading"}>{state === "loading" ? "Создаём…" : "Создать ссылку"}</button>}</section>{state === "error" ? <p className={styles["form-error"]}>Не удалось создать ссылку. Попробуйте ещё раз.</p> : null}<p className={styles["flow-note"]}><ShieldCheck size={16} />Реферальная ссылка не раскрывает содержимое Дневника.</p></>}</div></MiniAppChrome>;
}
