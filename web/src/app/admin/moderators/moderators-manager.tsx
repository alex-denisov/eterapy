"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const ALL_PERMISSIONS: Array<{ key: string; label: string; group: string }> = [
  // Клиенты
  { key: "clients.view",           label: "Просмотр клиентов",        group: "Клиенты" },
  { key: "clients.edit",           label: "Редактирование имени",      group: "Клиенты" },
  { key: "clients.block",          label: "Блокировка/разблокировка",  group: "Клиенты" },
  { key: "clients.reset_password", label: "Сброс пароля",              group: "Клиенты" },
  { key: "clients.set_password",   label: "Назначение пароля",         group: "Клиенты" },
  { key: "clients.view_sessions",  label: "Просмотр сессий",           group: "Клиенты" },
  { key: "clients.view_events",    label: "Просмотр событий (лог)",    group: "Клиенты" },
  // Практики
  { key: "practitioners.view",          label: "Просмотр практиков",        group: "Практики" },
  { key: "practitioners.create",        label: "Создание аккаунта",          group: "Практики" },
  { key: "practitioners.edit",          label: "Редактирование данных",      group: "Практики" },
  { key: "practitioners.block",         label: "Блокировка",                 group: "Практики" },
  { key: "practitioners.reset_password",label: "Сброс пароля",              group: "Практики" },
  { key: "practitioners.set_password",  label: "Назначение пароля",          group: "Практики" },
  { key: "practitioners.set_rates",     label: "Управление тарифами",        group: "Практики" },
  { key: "practitioners.set_schedule",  label: "Управление расписанием",     group: "Практики" },
  { key: "practitioners.view_earnings", label: "Просмотр выплат",            group: "Практики" },
];

interface Moderator {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  blockedAt: string | null;
  permissions: string[];
}

const groups = ["Клиенты", "Практики"];

interface PermMatrixProps {
  permissions: string[];
  onChange: (p: string[]) => void;
}

function PermMatrix({ permissions, onChange }: PermMatrixProps) {
  return (
    <div className="space-y-4">
      {groups.map(group => (
        <div key={group}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group}</p>
            <div className="flex gap-2">
              <button onClick={() => {
                const groupKeys = ALL_PERMISSIONS.filter(p => p.group === group).map(p => p.key);
                onChange([...new Set([...permissions, ...groupKeys])]);
              }} className="text-[11px] text-primary hover:underline">Все</button>
              <button onClick={() => {
                const groupKeys = ALL_PERMISSIONS.filter(p => p.group === group).map(p => p.key);
                onChange(permissions.filter(p => !groupKeys.includes(p)));
              }} className="text-[11px] text-muted-foreground hover:text-foreground">Сбросить</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {ALL_PERMISSIONS.filter(p => p.group === group).map(perm => {
              const checked = permissions.includes(perm.key);
              return (
                <label key={perm.key} className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                  checked ? "border-primary/30 bg-primary/5" : "border-border/20 hover:border-border/40"
                }`}>
                  <input type="checkbox" checked={checked}
                    onChange={e => onChange(e.target.checked ? [...permissions, perm.key] : permissions.filter(p => p !== perm.key))}
                    className="accent-primary" />
                  <span className="text-xs">{perm.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ModeratorsManager() {
  const [moderators, setModerators] = useState<Moderator[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [newPerms, setNewPerms] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/moderators");
    const d = await res.json();
    setModerators(d.moderators ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/set-state-in-effect

  async function handleCreate() {
    if (!newName || !newEmail || !newPwd) { toast.error("Заполните все поля"); return; }
    setCreating(true);
    const res = await fetch("/api/admin/moderators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, email: newEmail, password: newPwd, permissions: newPerms }),
    });
    const d = await res.json();
    if (d.ok) {
      toast.success("Модератор создан");
      setShowCreate(false); setNewName(""); setNewEmail(""); setNewPwd(""); setNewPerms([]);
      await load();
    } else toast.error(d.error ?? "Ошибка");
    setCreating(false);
  }

  async function updatePerms(moderatorId: string, perms: string[]) {
    const res = await fetch("/api/admin/moderators", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moderatorId, permissions: perms }),
    });
    const d = await res.json();
    if (d.ok) {
      setModerators(prev => prev.map(m => m.id === moderatorId ? { ...m, permissions: perms } : m));
      toast.success("Полномочия обновлены");
    } else toast.error(d.error ?? "Ошибка");
  }

  async function toggleBlock(mod: Moderator) {
    const res = await fetch("/api/admin/moderators", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moderatorId: mod.id, blockedAt: !mod.blockedAt }),
    });
    const d = await res.json();
    if (d.ok) {
      setModerators(prev => prev.map(m => m.id === mod.id ? { ...m, blockedAt: !mod.blockedAt ? new Date().toISOString() : null } : m));
      toast.success(mod.blockedAt ? "Разблокирован" : "Заблокирован");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить модератора? Это действие необратимо.")) return;
    const res = await fetch("/api/admin/moderators", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moderatorId: id }),
    });
    if ((await res.json()).ok) { toast.success("Удалён"); await load(); }
  }

  if (loading) return <p className="text-muted-foreground animate-pulse text-sm">Загружаем...</p>;

  return (
    <div className="space-y-4">
      <button onClick={() => setShowCreate(!showCreate)}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-navy">
        + Создать модератора
      </button>

      {/* Форма создания */}
      {showCreate && (
        <form autoComplete="off" onSubmit={e => e.preventDefault()} className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-4">
          <h3 className="font-semibold">Новый модератор</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input placeholder="Имя" value={newName} onChange={e => setNewName(e.target.value)} className="bg-card/50" autoComplete="off" name="mod-name" data-form-type="other" />
            <Input placeholder="Email" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="bg-card/50" autoComplete="off" name="mod-email" data-form-type="other" />
            <Input placeholder="Пароль (мин. 8)" type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)}
              className="bg-card/50" autoComplete="new-password" name="mod-pwd" id="mod-pwd" data-form-type="other" />
          </div>
          <PermMatrix permissions={newPerms} onChange={setNewPerms} />
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={creating}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50">
              {creating ? "Создание..." : "Создать"}
            </button>
            <button onClick={() => setShowCreate(false)}
              className="rounded-lg border border-border/40 px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
              Отмена
            </button>
          </div>
        </form>
      )}

      {/* Список */}
      {moderators.length === 0 ? (
        <p className="text-sm text-muted-foreground">Нет модераторов</p>
      ) : (
        <div className="space-y-2">
          {moderators.map(mod => {
            const isExpanded = expandedId === mod.id;
            return (
              <div key={mod.id} className="rounded-xl border border-border/30 bg-card/20 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{mod.name}</p>
                      {mod.blockedAt && <Badge className="bg-red-500/15 text-red-400 text-xs">Заблокирован</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{mod.email} · {mod.permissions.length} полномочий</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setExpandedId(isExpanded ? null : mod.id)}
                      className="rounded-lg border border-border/30 px-3 py-1 text-xs text-muted-foreground hover:text-foreground">
                      {isExpanded ? "Скрыть" : "Полномочия"}
                    </button>
                    <button onClick={() => toggleBlock(mod)}
                      className={`rounded-lg border px-3 py-1 text-xs ${mod.blockedAt ? "border-green-500/30 text-green-400" : "border-red-500/30 text-red-400"}`}>
                      {mod.blockedAt ? "Разблокировать" : "Заблокировать"}
                    </button>
                    <button onClick={() => handleDelete(mod.id)}
                      className="rounded-lg border border-red-500/20 px-3 py-1 text-xs text-red-400/60 hover:text-red-400">
                      Удалить
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t border-border/20 p-4">
                    <PermMatrix
                      permissions={mod.permissions}
                      onChange={perms => updatePerms(mod.id, perms)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
