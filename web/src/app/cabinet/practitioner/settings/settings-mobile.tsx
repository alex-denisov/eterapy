"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, LogOut, Send } from "lucide-react";
import { logoutUrl } from "@/lib/subdomain";

type Channel = "EMAIL" | "TELEGRAM" | "WEB";

interface Pref {
  event: string;
  category?: string;
  channel: Channel;
  enabled: boolean;
  remindBeforeHours: (number | null)[];
}

interface QuietHours {
  enabled: boolean;
  from: string;
  to: string;
  timezone: string;
}

interface TelegramStatus {
  linked: boolean;
  username: string | null;
}

// Курированные строки мобильной матрицы (mockup -more-settings) → реальные
// события бэка (getEventsForRole PRACTITIONER). Одна строка может покрывать
// несколько событий (bulk-toggle по каналу). События вне списка (session
// started/completed) сохраняют свои дефолты — их правит десктоп-матрица.
const MATRIX_ROWS: { key: string; label: string; sub?: string; events: string[] }[] = [
  { key: "requests", label: "Новые заявки", events: ["BOOKING_REQUESTED"] },
  { key: "changes", label: "Отмены и переносы", events: ["BOOKING_CANCELLED", "BOOKING_CHANGE_REQUESTED", "BOOKING_CHANGE_RESOLVED"] },
  { key: "reminder", label: "Напоминание о сессии", sub: "за 24 ч и за 1 ч", events: ["BOOKING_REMINDER"] },
  { key: "review", label: "Новый отзыв", events: ["NEW_REVIEW"] },
  { key: "payouts", label: "Выплаты", events: ["PAYMENT_RECEIVED", "BALANCE_TOPUP"] },
  { key: "subscription", label: "Подписка и оплата", events: ["SUBSCRIPTION_STARTED", "SUBSCRIPTION_RENEWAL", "SUBSCRIPTION_CANCELLED", "SUBSCRIPTION_PAYMENT_FAILED", "CARD_LINKED", "CARD_REMOVED"] },
  { key: "digest", label: "Дайджест недели", events: ["PRACTITIONER_DIGEST"] },
];

const CHANNELS: Channel[] = ["EMAIL", "TELEGRAM", "WEB"];
// дефолт канала при отсутствии pref (как десктоп: email/web on, telegram off)
const defaultEnabled = (ch: Channel) => ch !== "TELEGRAM";

/**
 * B466 R9 P5 — мобильный экран «Настройки» кокпита практика, 1-в-1 по approved
 * mockup practitioner-more-settings. pcab-native (НЕ обёртка десктопного
 * NotificationSettings): привязка Telegram + курированная матрица уведомлений
 * (событие × Email/Telegram/В приложении) + аккаунт (язык/пароль/выход).
 * Реюз ДАННЫХ: /api/notifications/preferences (GET/PUT), /api/notifications/
 * telegram-link (POST/GET/DELETE), /api/auth/change-password.
 */
export function PractitionerSettingsMobile({
  telegramStatus,
  hasPassword,
  backHref = "/cabinet/practitioner/more",
}: {
  telegramStatus: TelegramStatus;
  hasPassword: boolean;
  backHref?: string;
}) {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [quietHours, setQuietHours] = useState<QuietHours>({ enabled: false, from: "22:00", to: "09:00", timezone: "Europe/Moscow" });
  const [loading, setLoading] = useState(true);

  const [tg, setTg] = useState<TelegramStatus>(telegramStatus);
  const [connecting, setConnecting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [pwdOpen, setPwdOpen] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications/preferences")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setPrefs(d.prefs ?? []);
        if (d.quietHours) setQuietHours(d.quietHours);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  function isEnabled(list: Pref[], event: string, ch: Channel): boolean {
    const p = list.find((x) => x.event === event && x.channel === ch);
    return p ? p.enabled : defaultEnabled(ch);
  }
  const rowOn = (row: (typeof MATRIX_ROWS)[number], ch: Channel) =>
    row.events.every((e) => isEnabled(prefs, e, ch));

  async function persist(next: Pref[]) {
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefs: next, quietHours }),
      });
      if (!(await res.json()).ok) toast.error("Не удалось сохранить");
    } catch { toast.error("Не удалось сохранить"); }
  }

  function toggleRow(row: (typeof MATRIX_ROWS)[number], ch: Channel) {
    if (ch === "TELEGRAM" && !tg.linked) { toast("Сначала подключите Telegram"); return; }
    const nextValue = !rowOn(row, ch);
    const next = [...prefs];
    for (const event of row.events) {
      const i = next.findIndex((p) => p.event === event && p.channel === ch);
      if (i >= 0) next[i] = { ...next[i], enabled: nextValue };
      else next.push({ event, channel: ch, enabled: nextValue, remindBeforeHours: [] });
    }
    setPrefs(next);
    void persist(next);
  }

  async function connectTelegram() {
    setConnecting(true);
    try {
      const res = await fetch("/api/notifications/telegram-link", { method: "POST" });
      const d = await res.json();
      if (res.ok && d.ok) {
        if (d.linked) { setTg({ linked: true, username: d.username ?? null }); toast.success("Telegram уже подключён"); return; }
        const url = (d.url as string | undefined)?.replace("eterapy_deploy_bot", "eterapy_bot");
        if (url) window.open(url, "_blank", "noopener,noreferrer");
        if (pollRef.current) clearInterval(pollRef.current);
        const started = Date.now();
        pollRef.current = setInterval(async () => {
          if (Date.now() - started > 120_000) { if (pollRef.current) clearInterval(pollRef.current); return; }
          try {
            const s = await (await fetch("/api/notifications/telegram-link", { cache: "no-store" })).json();
            if (s.linked) {
              setTg({ linked: true, username: s.username ?? null });
              toast.success("Telegram подключён");
              if (pollRef.current) clearInterval(pollRef.current);
            }
          } catch { /* keep polling */ }
        }, 3000);
      } else {
        toast.error(d.error ?? "Не удалось создать ссылку");
      }
    } catch { toast.error("Не удалось создать ссылку"); }
    finally { setConnecting(false); }
  }

  async function unlinkTelegram() {
    try {
      const d = await (await fetch("/api/notifications/telegram-link", { method: "DELETE" })).json();
      if (d.ok) { setTg({ linked: false, username: null }); toast.success("Telegram отвязан"); }
      else toast.error(d.error ?? "Ошибка");
    } catch { toast.error("Ошибка"); }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd !== confirmPwd) { toast.error("Пароли не совпадают"); return; }
    if (newPwd.length < 8) { toast.error("Минимум 8 символов"); return; }
    setSavingPwd(true);
    try {
      const d = await (await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
      })).json();
      if (d.ok) { toast.success("Пароль изменён"); setCurrentPwd(""); setNewPwd(""); setConfirmPwd(""); setPwdOpen(false); }
      else toast.error(d.error || "Ошибка");
    } catch { toast.error("Ошибка"); }
    finally { setSavingPwd(false); }
  }

  return (
    <div className="pcab-screen md:hidden" data-pcab-top data-testid="practitioner-settings-mobile">
      <div className="pcab-topbar">
        <Link href={backHref} className="pcab-roundbtn" aria-label="Назад">
          <ChevronLeft width={19} height={19} aria-hidden="true" />
        </Link>
        <span className="pcab-topbar-title">Настройки</span>
        <span className="pcab-topbar-spacer" aria-hidden="true" />
      </div>

      {/* Telegram */}
      <div className="pcab-eyebrow pcab-set-eyebrow">Уведомления в Telegram</div>
      <div className="pcab-tgcard">
        <span className="pcab-tgcard-ic"><Send size={22} aria-hidden="true" /></span>
        <div className="pcab-tgcard-main">
          <div className="pcab-tgcard-t">{tg.linked ? "Telegram подключён" : "Telegram не подключён"}</div>
          <div className="pcab-tgcard-s">
            {tg.linked
              ? (tg.username ? `@${tg.username}` : "Уведомления приходят в чат.")
              : "Быстрые уведомления о заявках и сессиях прямо в чат."}
          </div>
        </div>
        {tg.linked ? (
          <button type="button" className="pcab-tgcard-unlink" onClick={unlinkTelegram} data-testid="practitioner-settings-tg-unlink">Отвязать</button>
        ) : (
          <button type="button" className="pcab-tgcard-btn" onClick={connectTelegram} disabled={connecting} data-testid="practitioner-settings-tg-connect">
            {connecting ? "…" : "Подключить"}
          </button>
        )}
      </div>
      {!tg.linked && (
        <div className="pcab-set-hint">Откроется бот @eterapy_bot — нажмите «Старт», аккаунт свяжется автоматически.</div>
      )}

      {/* Матрица уведомлений */}
      <div className="pcab-eyebrow pcab-set-eyebrow">Что и куда присылать</div>
      <div className="pcab-mx" data-testid="practitioner-settings-matrix">
        <div className="pcab-mx-head">
          <span className="pcab-mx-lbl">Событие</span>
          <span className="pcab-mx-col" title="E-mail">Email</span>
          <span className={`pcab-mx-col${tg.linked ? "" : " dim"}`} title="Telegram">TG</span>
          <span className="pcab-mx-col" title="В приложении">В прил.</span>
        </div>
        {loading ? (
          <div className="pcab-mx-loading">Загружаем…</div>
        ) : (
          MATRIX_ROWS.map((row) => (
            <div key={row.key} className="pcab-mx-row">
              <span className="pcab-mx-rowlbl">
                <span className="pcab-mx-t">{row.label}</span>
                {row.sub && <span className="pcab-mx-s">{row.sub}</span>}
              </span>
              {CHANNELS.map((ch) => {
                const on = rowOn(row, ch);
                const dim = ch === "TELEGRAM" && !tg.linked;
                return (
                  <span key={ch} className="pcab-mx-cell">
                    <button
                      type="button"
                      className={`pcab-cb${on ? " on" : ""}${dim ? " dim" : ""}`}
                      role="checkbox"
                      aria-checked={on}
                      aria-disabled={dim}
                      aria-label={`${row.label} — ${ch === "EMAIL" ? "Email" : ch === "TELEGRAM" ? "Telegram" : "В приложении"}`}
                      onClick={() => toggleRow(row, ch)}
                      data-testid={`practitioner-settings-cb-${row.key}-${ch.toLowerCase()}`}
                    >
                      {on && <Check size={13} strokeWidth={3} aria-hidden="true" />}
                    </button>
                  </span>
                );
              })}
            </div>
          ))
        )}
      </div>
      <div className="pcab-set-hint">Столбец Telegram активируется после подключения (выше).</div>

      {/* Аккаунт */}
      <div className="pcab-eyebrow pcab-set-eyebrow">Аккаунт</div>
      <div className="pcab-list">
        <div className="pcab-row">
          <span className="pcab-row-main"><span className="pcab-row-t">Язык интерфейса</span></span>
          <span className="pcab-set-rowval">Русский</span>
          <ChevronRight className="pcab-chev" size={18} aria-hidden="true" />
        </div>
        {hasPassword ? (
          <>
            <button type="button" className="pcab-row pcab-set-rowbtn" onClick={() => setPwdOpen((o) => !o)} data-testid="practitioner-settings-password-row">
              <span className="pcab-row-main"><span className="pcab-row-t">Пароль</span></span>
              <ChevronRight className="pcab-chev" size={18} aria-hidden="true" style={pwdOpen ? { transform: "rotate(90deg)" } : undefined} />
            </button>
            {pwdOpen && (
              <form onSubmit={savePassword} className="pcab-set-pwd" data-testid="practitioner-settings-password-form">
                <input type="password" className="pcab-set-input" placeholder="Текущий пароль" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} autoComplete="current-password" aria-label="Текущий пароль" />
                <input type="password" className="pcab-set-input" placeholder="Новый пароль" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} autoComplete="new-password" aria-label="Новый пароль" />
                <input type="password" className="pcab-set-input" placeholder="Повторите новый пароль" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} autoComplete="new-password" aria-label="Повторите новый пароль" />
                <button type="submit" className="pcab-abtn pcab-abtn-primary" disabled={savingPwd || !currentPwd || !newPwd}>
                  {savingPwd ? "Сохранение…" : "Изменить пароль"}
                </button>
              </form>
            )}
          </>
        ) : (
          <div className="pcab-row">
            <span className="pcab-row-main">
              <span className="pcab-row-t">Пароль</span>
              <span className="pcab-row-s">Вход через внешний сервис — смена недоступна</span>
            </span>
          </div>
        )}
        <a href={logoutUrl()} className="pcab-row pcab-set-logout" data-testid="practitioner-settings-logout">
          <span className="pcab-row-main"><span className="pcab-row-t">Выйти из аккаунта</span></span>
          <LogOut size={17} aria-hidden="true" />
        </a>
      </div>

      <div className="pcab-set-ver">ETerapy для практиков · v5.0</div>
    </div>
  );
}
