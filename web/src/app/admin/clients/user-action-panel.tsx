"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

interface User {
  id: string;
  name: string;
  email: string;
  blockedAt: string | Date | null;
  deletedAt: string | Date | null;
  freeToolsLimit: number | null;
}

export function UserActionPanel({
  user,
  adminRole,
  onUpdate,
}: {
  user: User;
  adminRole: string;
  onUpdate: (patch: Partial<User>) => void;
}) {
  const [name, setName] = useState(user.name);
  const [newPwd, setNewPwd] = useState("");
  const [blockComment, setBlockComment] = useState("");
  const [tab, setTab] = useState<"actions" | "sessions" | "events">("actions");
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
    if (d.ok) {
      toast.success("Выполнено");
      return true;
    }
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
    const res = await fetch(`/api/bookings?userId=${user.id}&role=admin`);
    const d = await res.json();
    setSessions(d.bookings ?? []);
    setLoadingSessions(false);
  }

  const ACTION_LABELS: Record<string, string> = {
    LOGIN: "Вход", LOGOUT: "Выход", PASSWORD_RESET: "Сброс пароля", PASSWORD_CHANGE: "Смена пароля",
    PASSWORD_SET: "Пароль назначен", PROFILE_UPDATE: "Обновление профиля", AVATAR_ADD: "Добавлен аватар",
    AVATAR_REMOVE: "Удалён аватар", ACCOUNT_BLOCK: "Аккаунт заблокирован", ACCOUNT_UNBLOCK: "Аккаунт разблокирован",
    BOOKING_CREATE: "Создано бронирование", BOOKING_CANCEL: "Бронирование отменено",
  };

  return (
    <div>
      {/* Табы */}
      <div className="flex gap-1 mb-4 border-b border-border/20 pb-2">
        {(["actions", "sessions", "events"] as const).map(t => (
          <button key={t} onClick={() => {
            setTab(t);
            if (t === "events" && events.length === 0) loadEvents();
            if (t === "sessions" && sessions.length === 0) loadSessions();
          }}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              tab === t ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}>
            {{ actions: "⚙️ Действия", sessions: "📅 Сессии", events: "📋 События" }[t]}
          </button>
        ))}
      </div>

      {/* Действия */}
      {tab === "actions" && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Имя */}
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

          {/* Пароль */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Пароль</p>
            <div className="flex gap-2">
              <Input type="password" placeholder="Новый пароль" value={newPwd}
                onChange={e => setNewPwd(e.target.value)} className="bg-card/50 text-sm h-8" />
              <button onClick={async () => { if (await callAction("set_password", { newPassword: newPwd })) setNewPwd(""); }}
                disabled={newPwd.length < 8}
                className="rounded-lg bg-primary/20 px-3 text-xs text-primary hover:bg-primary/30 disabled:opacity-40 shrink-0">
                Назначить
              </button>
            </div>
            <button onClick={() => callAction("reset_password")}
              className="text-xs text-primary hover:underline">
              📧 Отправить ссылку сброса на email
            </button>
          </div>

          {/* Блокировка */}
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

          {/* Войти в кабинет */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Прочее</p>
            <a href={`/api/admin/impersonate?userId=${user.id}`} target="_blank"
              className="inline-block rounded-lg border border-border/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              👤 Войти в кабинет пользователя
            </a>
          </div>
        </div>
      )}

      {/* Сессии */}
      {tab === "sessions" && (
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
      {tab === "events" && (
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
