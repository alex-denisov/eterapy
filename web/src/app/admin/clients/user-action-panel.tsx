"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import type { Permission } from "@/lib/moderator-permissions";

interface User {
  id: string;
  name: string;
  email: string;
  blockedAt: string | Date | null;
  deletedAt: string | Date | null;
  freeToolsLimit: number | null;
  provider?: string | null;
  registrationChannel?: string | null;
  balance?: number | null; // kopecks
  birthDate?: string | Date | null;
  birthTime?: string | null;
  birthPlace?: string | null;
  timezone?: string | null;
  telegramUsername?: string | null;
}

export function UserActionPanel({
  user,
  adminRole,
  permissions,
  onUpdate,
}: {
  user: User;
  adminRole: string;
  permissions: Permission[];
  onUpdate: (patch: Partial<User>) => void;
}) {
  const can = (p: Permission) => permissions.includes(p);

  // Compute visible tabs based on permissions
  type TabId = "actions" | "sessions" | "events";
  const visibleTabs: Array<{ id: TabId; label: string }> = [
    { id: "actions", label: "⚙️ Действия" },
    ...(can("clients.view_sessions") ? [{ id: "sessions" as TabId, label: "📅 Сессии" }] : []),
    ...(can("clients.view_events")   ? [{ id: "events"   as TabId, label: "📋 События" }] : []),
  ];

  const [name, setName] = useState(user.name);
  const [newPwd, setNewPwd] = useState("");
  const [blockComment, setBlockComment] = useState("");
  const [deleteComment, setDeleteComment] = useState("");
  const [email, setEmail] = useState(user.email);
  const [birthDate, setBirthDate] = useState(
    user.birthDate ? new Date(user.birthDate).toISOString().slice(0, 10) : "",
  );
  const [birthTime, setBirthTime] = useState(user.birthTime ?? "");
  const [birthPlace, setBirthPlace] = useState(user.birthPlace ?? "");
  const [timezone, setTimezone] = useState(user.timezone ?? "");
  const [telegramUsername, setTelegramUsername] = useState(user.telegramUsername ?? "");
  const [balanceRub, setBalanceRub] = useState(
    user.balance != null ? String(Math.round(user.balance / 100)) : "0",
  );
  const [balanceReason, setBalanceReason] = useState("");
  const [freeLimitInput, setFreeLimitInput] = useState(
    user.freeToolsLimit == null ? "" : String(user.freeToolsLimit),
  );
  const [tab, setTab] = useState<TabId>("actions");
  const [events, setEvents] = useState<Array<{ action: string; createdAt: string; details: string | null }>>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [sessions, setSessions] = useState<Array<{ id: string; status: string; priceRub: number; createdAt: string }>>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  async function callAction(action: string, extra: Record<string, string> = {}) {
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const d = await res.json();
    if (d.ok) { toast.success("Выполнено"); return true; }
    toast.error(d.error ?? "Ошибка");
    return false;
  }

  async function loadEvents() {
    setLoadingEvents(true);
    const res = await fetch(`/api/admin/audit?targetId=${user.id}&limit=50`);
    const d = await res.json();
    setEvents(d.logs ?? []);
    setLoadingEvents(false);
  }

  async function loadSessions() {
    setLoadingSessions(true);
    const res = await fetch(`/api/bookings?role=admin&userId=${user.id}`);
    const d = await res.json();
    setSessions(d.bookings ?? []);
    setLoadingSessions(false);
  }

  const ACTION_LABELS: Record<string, string> = {
    REGISTER: "Регистрация", LOGIN: "Вход", LOGOUT: "Выход",
    PASSWORD_RESET: "Сброс пароля", PASSWORD_CHANGE: "Смена пароля",
    PASSWORD_SET: "Пароль назначен", PROFILE_UPDATE: "Обновление профиля",
    AVATAR_ADD: "Добавлен аватар", AVATAR_REMOVE: "Удалён аватар",
    ACCOUNT_BLOCK: "Аккаунт заблокирован", ACCOUNT_UNBLOCK: "Аккаунт разблокирован",
    BOOKING_CREATE: "Создано бронирование", BOOKING_CANCEL: "Бронирование отменено",
    EMAIL_VERIFY: "Email подтверждён", ACCOUNT_DELETE: "Аккаунт удалён",
  };

  return (
    <div>
      {/* Табы — только разрешённые */}
      {visibleTabs.length > 1 && (
        <div className="flex gap-1 mb-4 border-b border-border/20 pb-2">
          {visibleTabs.map(t => (
            <button key={t.id} onClick={() => {
              setTab(t.id);
              if (t.id === "events" && events.length === 0) loadEvents();
              if (t.id === "sessions" && sessions.length === 0) loadSessions();
            }}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                tab === t.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Действия */}
      {tab === "actions" && (
        <form autoComplete="off" onSubmit={e => e.preventDefault()}>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Имя */}
          {can("clients.edit") && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Имя</p>
              <div className="flex gap-2">
                <Input value={name} onChange={e => setName(e.target.value)} className="bg-card/50 text-sm h-8" />
                <button onClick={async () => { if (await callAction("update_name", { name })) onUpdate({ name }); }}
                  className="rounded-lg bg-primary/20 px-3 text-xs text-primary hover:bg-primary/30 shrink-0">
                  Сохранить
                </button>
              </div>
            </div>
          )}

          {/* Канал регистрации */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Регистрация</p>
            <div className="rounded-lg border border-border/20 bg-card/30 px-3 py-2 text-xs text-foreground">
              <p className="text-muted-foreground">Канал: <span className="text-foreground font-medium">{
                user.registrationChannel === "site" ? "Сайт" :
                user.registrationChannel === "google" ? "Google" :
                user.registrationChannel === "vk" ? "VK" :
                user.registrationChannel === "telegram" ? "Telegram" :
                user.registrationChannel === "referral" ? "Реферал" :
                user.registrationChannel || "Не указан"
              }</span></p>
              {user.provider && (
                <p className="text-muted-foreground mt-1">Провайдер: <span className="text-foreground font-medium">{user.provider}</span></p>
              )}
            </div>
          </div>

          {/* Пароль */}
          {(can("clients.set_password") || can("clients.reset_password")) && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Пароль</p>
              {can("clients.set_password") && (
                <div className="flex gap-2">
                  <Input type="password" autoComplete="new-password" placeholder="Новый пароль" value={newPwd}
                    onChange={e => setNewPwd(e.target.value)} className="bg-card/50 text-sm h-8"
                    name="admin-new-password-unique" id="admin-new-password-unique" data-form-type="other" />
                  <button onClick={async () => { if (await callAction("set_password", { newPassword: newPwd })) setNewPwd(""); }}
                    disabled={newPwd.length < 8}
                    className="rounded-lg bg-primary/20 px-3 text-xs text-primary hover:bg-primary/30 disabled:opacity-40 shrink-0">
                    Назначить
                  </button>
                </div>
              )}
              {can("clients.reset_password") && (
                <button onClick={() => callAction("reset_password")}
                  className="text-xs text-primary hover:underline">
                  📧 Отправить ссылку сброса на email
                </button>
              )}
            </div>
          )}

          {/* Блокировка */}
          {can("clients.block") && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Доступ</p>
              {user.blockedAt ? (
                <button onClick={async () => { if (await callAction("unblock")) onUpdate({ blockedAt: null }); }}
                  className="rounded-lg border border-green-500/30 px-3 py-1.5 text-xs text-green-400 hover:bg-green-500/10">
                  ✓ Разблокировать
                </button>
              ) : (
                <div className="flex gap-2">
                  <Input placeholder="Причина блокировки" value={blockComment}
                    onChange={e => setBlockComment(e.target.value)} className="bg-card/50 text-sm h-8" />
                  <button onClick={async () => {
                    if (await callAction("block", { comment: blockComment }))
                      onUpdate({ blockedAt: new Date().toISOString() });
                  }}
                    className="rounded-lg border border-red-500/30 px-3 text-xs text-red-400 hover:bg-red-500/10 shrink-0">
                    🚫 Заблокировать
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Войти в кабинет — только суперадмин */}
          {adminRole === "SUPERADMIN" && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Прочее</p>
              <a href={`/api/admin/impersonate?userId=${user.id}`} target="_blank"
                className="inline-block rounded-lg border border-border/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                👤 Войти в кабинет пользователя
              </a>
            </div>
          )}

          {/* Если нет ни одного полномочия кроме view */}
          {!can("clients.edit") && !can("clients.block") && !can("clients.set_password") &&
           !can("clients.reset_password") && adminRole !== "SUPERADMIN" && (
            <p className="text-xs text-muted-foreground col-span-2">
              У вас нет полномочий для редактирования этого пользователя.
            </p>
          )}
        </div>

        {/* Расширенный профиль — только superadmin или edit-permission */}
        {can("clients.edit") && (
          <div className="mt-6 space-y-4 border-t border-border/20 pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Профиль</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Email</label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="bg-card/50 text-sm h-8" autoComplete="off" />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Telegram (@login)</label>
                <Input value={telegramUsername} onChange={e => setTelegramUsername(e.target.value)}
                  placeholder="username" className="bg-card/50 text-sm h-8" autoComplete="off" />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Дата рождения</label>
                <Input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)}
                  className="bg-card/50 text-sm h-8" />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Время рождения</label>
                <Input type="time" value={birthTime} onChange={e => setBirthTime(e.target.value)}
                  className="bg-card/50 text-sm h-8" />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Город</label>
                <Input value={birthPlace} onChange={e => setBirthPlace(e.target.value)}
                  placeholder="Москва" className="bg-card/50 text-sm h-8" autoComplete="off" />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Часовой пояс</label>
                <Input value={timezone} onChange={e => setTimezone(e.target.value)}
                  placeholder="Europe/Moscow" className="bg-card/50 text-sm h-8" autoComplete="off" />
              </div>
            </div>
            <button onClick={async () => {
              const ok = await callAction("update_profile", {
                email, birthDate, birthTime, birthPlace, timezone, telegramUsername,
              });
              if (ok) onUpdate({ email, birthDate, birthTime, birthPlace, timezone, telegramUsername });
            }}
              className="rounded-lg bg-primary/20 px-4 py-1.5 text-xs text-primary hover:bg-primary/30">
              Сохранить профиль
            </button>
          </div>
        )}

        {/* Баланс — только superadmin */}
        {adminRole === "SUPERADMIN" && (
          <div className="mt-6 space-y-3 border-t border-border/20 pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Баланс (ручная корректировка)</p>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Баланс, ₽</label>
                <Input type="number" value={balanceRub} onChange={e => setBalanceRub(e.target.value)}
                  className="bg-card/50 text-sm h-8 w-32" />
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="block text-[11px] text-muted-foreground mb-1">Причина (в аудит)</label>
                <Input value={balanceReason} onChange={e => setBalanceReason(e.target.value)}
                  placeholder="Возврат / корректировка" className="bg-card/50 text-sm h-8" />
              </div>
              <button onClick={async () => {
                const ok = await callAction("update_balance", { balanceRub, reason: balanceReason });
                if (ok) { setBalanceReason(""); onUpdate({ balance: Math.round(Number(balanceRub) * 100) }); }
              }}
                className="rounded-lg bg-primary/20 px-3 h-8 text-xs text-primary hover:bg-primary/30 shrink-0">
                Применить
              </button>
            </div>
          </div>
        )}

        {/* Лимит бесплатных AI-инструментов — только superadmin */}
        {adminRole === "SUPERADMIN" && (
          <div className="mt-6 space-y-2 border-t border-border/20 pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Лимит бесплатных «направлений»</p>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Оставить пустым — план по умолчанию (3)</label>
                <Input type="number" min={0} value={freeLimitInput}
                  onChange={e => setFreeLimitInput(e.target.value)}
                  placeholder="3" className="bg-card/50 text-sm h-8 w-28" />
              </div>
              <button onClick={async () => {
                const val = freeLimitInput.trim();
                const payload = val === "" ? { limit: "unlimited" } : { limit: val };
                const ok = await callAction("set_free_limit", payload);
                if (ok) onUpdate({ freeToolsLimit: val === "" ? 0 : Number(val) });
              }}
                className="rounded-lg bg-primary/20 px-3 h-8 text-xs text-primary hover:bg-primary/30">
                Сохранить
              </button>
              <span className="text-[11px] text-muted-foreground">0 = безлимит</span>
            </div>
          </div>
        )}

        {/* Удаление с 10-дневной отсрочкой — clients.delete (у SUPERADMIN есть автоматически) */}
        {can("clients.delete") && (
          <div className="mt-6 space-y-2 border-t border-border/20 pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Удаление аккаунта</p>
            {user.deletedAt ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-yellow-400">
                  Помечен на удаление {new Date(user.deletedAt).toLocaleString("ru-RU")}
                  . Покой до {new Date(new Date(user.deletedAt).getTime() + 10 * 86400_000).toLocaleDateString("ru-RU")}.
                </span>
                <button onClick={async () => {
                  if (await callAction("restore")) onUpdate({ deletedAt: null });
                }}
                  className="rounded-lg border border-green-500/30 px-3 py-1.5 text-xs text-green-400 hover:bg-green-500/10">
                  ↺ Восстановить
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Input value={deleteComment} onChange={e => setDeleteComment(e.target.value)}
                  placeholder="Причина удаления" className="bg-card/50 text-sm h-8 flex-1 min-w-[200px]" />
                <button onClick={async () => {
                  if (!window.confirm("Пометить на удаление? Будет безвозвратно удалён через 10 дней (cron /api/cron/cleanup).")) return;
                  if (await callAction("soft_delete", { comment: deleteComment })) {
                    onUpdate({ deletedAt: new Date().toISOString() });
                    setDeleteComment("");
                  }
                }}
                  className="rounded-lg border border-red-500/30 px-3 h-8 text-xs text-red-400 hover:bg-red-500/10 shrink-0">
                  🗑 Удалить (10 дней)
                </button>
              </div>
            )}
          </div>
        )}
        </form>
      )}

      {/* Сессии */}
      {tab === "sessions" && can("clients.view_sessions") && (
        <div>
          {loadingSessions ? <p className="text-xs text-muted-foreground animate-pulse">Загружаем...</p>
            : sessions.length === 0 ? <p className="text-xs text-muted-foreground">Нет сессий</p>
            : (
              <div className="space-y-1">
                {sessions.map(s => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border border-border/20 px-3 py-2 text-xs">
                    <span className="text-muted-foreground">{new Date(s.createdAt).toLocaleDateString("ru-RU")}</span>
                    <span className={s.status === "COMPLETED" ? "text-primary" : s.status === "CANCELLED" ? "text-muted-foreground" : "text-yellow-400"}>
                      {s.status}
                    </span>
                    <span className="text-primary">{s.priceRub.toLocaleString("ru")} ₽</span>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}

      {/* События */}
      {tab === "events" && can("clients.view_events") && (
        <div>
          {loadingEvents ? <p className="text-xs text-muted-foreground animate-pulse">Загружаем...</p>
            : events.length === 0 ? <p className="text-xs text-muted-foreground">Нет событий</p>
            : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {events.map((e, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg border border-border/10 px-3 py-2 text-xs">
                    <span className="text-muted-foreground/60 shrink-0 w-28">
                      {new Date(e.createdAt).toLocaleDateString("ru-RU")} {new Date(e.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="font-medium">{ACTION_LABELS[e.action] ?? e.action}</span>
                    {e.details && <span className="text-muted-foreground/60 truncate">{e.details}</span>}
                  </div>
                ))}
              </div>
            )}
        </div>
      )}
    </div>
  );
}
