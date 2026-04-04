"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface LogEntry {
  id: string;
  userId: string;
  targetId: string | null;
  action: string;
  details: string | null;
  ip: string | null;
  createdAt: string;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  targetName: string | null;
}

const ACTION_META: Record<string, { label: string; color: string; icon: string }> = {
  REGISTER:                { label: "Регистрация",         color: "bg-green-500/10 text-green-400",   icon: "👤" },
  LOGIN:                   { label: "Вход",                color: "bg-blue-500/10 text-blue-400",     icon: "🔑" },
  LOGOUT:                  { label: "Выход",               color: "bg-gray-500/10 text-gray-400",     icon: "🚪" },
  PASSWORD_RESET:          { label: "Сброс пароля",        color: "bg-yellow-500/10 text-yellow-400", icon: "🔄" },
  PASSWORD_CHANGE:         { label: "Смена пароля",        color: "bg-yellow-500/10 text-yellow-400", icon: "🔒" },
  PASSWORD_SET:            { label: "Назначение пароля",   color: "bg-orange-500/10 text-orange-400", icon: "🔧" },
  PROFILE_UPDATE:          { label: "Обновление профиля",  color: "bg-blue-500/10 text-blue-400",     icon: "✏️" },
  AVATAR_ADD:              { label: "Аватар загружен",     color: "bg-purple-500/10 text-purple-400", icon: "🖼️" },
  AVATAR_REMOVE:           { label: "Аватар удалён",       color: "bg-red-500/10 text-red-400",       icon: "🗑️" },
  ACCOUNT_BLOCK:           { label: "Заблокирован",        color: "bg-red-500/10 text-red-400",       icon: "🚫" },
  ACCOUNT_UNBLOCK:         { label: "Разблокирован",       color: "bg-green-500/10 text-green-400",   icon: "✓" },
  ACCOUNT_DELETE:          { label: "Удаление аккаунта",   color: "bg-red-500/20 text-red-400",       icon: "❌" },
  EMAIL_VERIFY:            { label: "Email подтверждён",   color: "bg-green-500/10 text-green-400",   icon: "✉️" },
  BOOKING_CREATE:          { label: "Запись создана",      color: "bg-primary/10 text-primary",       icon: "📅" },
  BOOKING_CANCEL:          { label: "Запись отменена",     color: "bg-orange-500/10 text-orange-400", icon: "📅" },
  BOOKING_CONFIRM:         { label: "Запись подтверждена", color: "bg-primary/10 text-primary",       icon: "✓" },
  IMPERSONATE:             { label: "Вход как пользователь", color: "bg-purple-500/20 text-purple-400", icon: "👁️" },
  PRACTITIONER_CREATE:     { label: "Практик создан",      color: "bg-primary/10 text-primary",       icon: "🔮" },
  PRACTITIONER_STATUS:     { label: "Статус практика",     color: "bg-yellow-500/10 text-yellow-400", icon: "🔄" },
  PRACTITIONER_PROFILE_UPDATE: { label: "Профиль практика", color: "bg-blue-500/10 text-blue-400",   icon: "✏️" },
};

const ACTION_GROUPS = {
  all: "Все",
  auth: "Авторизация",
  account: "Аккаунт",
  admin: "Администрирование",
  booking: "Бронирования",
};

function getGroup(action: string): keyof typeof ACTION_GROUPS {
  if (["LOGIN", "LOGOUT", "REGISTER", "EMAIL_VERIFY"].includes(action)) return "auth";
  if (["PASSWORD_RESET", "PASSWORD_CHANGE", "PASSWORD_SET", "PROFILE_UPDATE", "AVATAR_ADD", "AVATAR_REMOVE", "ACCOUNT_DELETE"].includes(action)) return "account";
  if (["ACCOUNT_BLOCK", "ACCOUNT_UNBLOCK", "IMPERSONATE", "PRACTITIONER_CREATE", "PRACTITIONER_STATUS", "PRACTITIONER_PROFILE_UPDATE"].includes(action)) return "admin";
  if (action.startsWith("BOOKING")) return "booking";
  return "all";
}

export function LogsViewer({ logs }: { logs: LogEntry[] }) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<keyof typeof ACTION_GROUPS>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return logs.filter(l => {
      if (group !== "all" && getGroup(l.action) !== group) return false;
      if (!q) return true;
      return (
        l.actorName.toLowerCase().includes(q) ||
        l.actorEmail.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        (l.details?.toLowerCase().includes(q) ?? false) ||
        (l.targetName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [logs, search, group]);

  return (
    <div className="space-y-4">
      {/* Фильтры */}
      <div className="flex flex-wrap gap-3 items-center">
        <Input placeholder="Поиск по пользователю, действию, деталям..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="bg-card/50 max-w-sm h-8 text-sm" />
        <div className="flex gap-1">
          {Object.entries(ACTION_GROUPS).map(([key, label]) => (
            <button key={key} onClick={() => setGroup(key as keyof typeof ACTION_GROUPS)}
              className={`rounded-lg px-3 py-1 text-xs transition-colors ${
                group === key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}>
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} записей</span>
      </div>

      {/* Лог */}
      <div className="rounded-xl border border-border/30 overflow-hidden divide-y divide-border/10">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Нет записей</div>
        ) : filtered.map(l => {
          const meta = ACTION_META[l.action] ?? { label: l.action, color: "bg-muted/10 text-muted-foreground", icon: "•" };
          const isExpanded = expandedId === l.id;
          return (
            <div key={l.id}
              className="px-4 py-2.5 hover:bg-white/2 transition-colors cursor-pointer"
              onClick={() => setExpandedId(isExpanded ? null : l.id)}>
              <div className="flex items-center gap-3">
                {/* Время */}
                <span className="text-xs text-muted-foreground/60 shrink-0 w-32">
                  {new Date(l.createdAt).toLocaleDateString("ru-RU")} {new Date(l.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
                {/* Действие */}
                <Badge className={`${meta.color} text-[10px] shrink-0 gap-1`}>
                  {meta.icon} {meta.label}
                </Badge>
                {/* Актор */}
                <span className="text-sm font-medium truncate min-w-0">{l.actorName}</span>
                {l.actorRole && (
                  <span className="text-xs text-muted-foreground/50 shrink-0">{l.actorRole}</span>
                )}
                {/* Цель */}
                {l.targetName && l.targetName !== l.actorName && (
                  <>
                    <span className="text-muted-foreground/40 text-xs shrink-0">→</span>
                    <span className="text-xs text-muted-foreground truncate">{l.targetName}</span>
                  </>
                )}
                {/* Детали */}
                {l.details && !isExpanded && (
                  <span className="text-xs text-muted-foreground/50 truncate ml-auto max-w-48">{l.details}</span>
                )}
                <span className="ml-auto text-muted-foreground/30 text-xs shrink-0">{isExpanded ? "▲" : "▼"}</span>
              </div>
              {/* Раскрытые детали */}
              {isExpanded && (
                <div className="mt-2 ml-32 space-y-1">
                  <div className="rounded-lg bg-card/30 px-3 py-2 text-xs space-y-1">
                    <div className="flex gap-4">
                      <span className="text-muted-foreground w-16 shrink-0">ID</span>
                      <code className="text-muted-foreground/60">{l.id}</code>
                    </div>
                    <div className="flex gap-4">
                      <span className="text-muted-foreground w-16 shrink-0">Актор</span>
                      <span>{l.actorName} ({l.actorEmail})</span>
                    </div>
                    {l.targetId && (
                      <div className="flex gap-4">
                        <span className="text-muted-foreground w-16 shrink-0">Цель</span>
                        <span>{l.targetName ?? l.targetId}</span>
                      </div>
                    )}
                    {l.ip && (
                      <div className="flex gap-4">
                        <span className="text-muted-foreground w-16 shrink-0">IP</span>
                        <code>{l.ip}</code>
                      </div>
                    )}
                    {l.details && (
                      <div className="flex gap-4">
                        <span className="text-muted-foreground w-16 shrink-0">Детали</span>
                        <span>{l.details}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
