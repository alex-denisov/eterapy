"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { UserActionPanel } from "./user-action-panel";
import { CreateClientModal } from "./create-client-modal";
import type { Permission } from "@/lib/moderator-permissions";
import { resolveRegistrationChannel } from "@/lib/registration-channel";

interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date | string;
  blockedAt: string | Date | null;
  deletedAt: string | Date | null;
  freeToolsLimit: number | null;
  avatarUrl: string | null;
  provider?: string | null;
  registrationChannel?: string | null;
  balance?: number | null;
  birthDate?: string | Date | null;
  birthTime?: string | null;
  birthPlace?: string | null;
  timezone?: string | null;
  telegramUsername?: string | null;
}

function SortBtn({
  field,
  label,
  active,
  sortDir,
  onSort,
}: {
  field: "name" | "email" | "createdAt";
  label: string;
  active: boolean;
  sortDir: "asc" | "desc";
  onSort: (field: "name" | "email" | "createdAt") => void;
}) {
  return (
    <button
      onClick={() => onSort(field)}
      className={`flex items-center gap-1 text-xs font-medium ${
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      {active && <span>{sortDir === "asc" ? "↑" : "↓"}</span>}
    </button>
  );
}

export function ClientsTable({
  users,
  adminRole,
  permissions,
  canCreate = false,
}: {
  users: User[];
  adminRole: string;
  permissions: Permission[];
  canCreate?: boolean;
}) {
  const router = useRouter();
  const can = (p: Permission) => permissions.includes(p);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"name" | "email" | "createdAt">("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "blocked" | "deleted">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [localUsers, setLocalUsers] = useState(users);
  const [showCreate, setShowCreate] = useState(false);

  const filtered = useMemo(() => {
    let list = [...localUsers];
    const q = search.toLowerCase();
    if (q) list = list.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    if (filterStatus === "blocked") list = list.filter(u => !!u.blockedAt);
    else if (filterStatus === "deleted") list = list.filter(u => !!u.deletedAt);
    else if (filterStatus === "active") list = list.filter(u => !u.blockedAt && !u.deletedAt);
    list.sort((a, b) => {
      const va = String(a[sortField] ?? "");
      const vb = String(b[sortField] ?? "");
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return list;
  }, [localUsers, search, sortField, sortDir, filterStatus]);

  function handleSort(field: "name" | "email" | "createdAt") {
    if (sortField === field) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function updateUser(id: string, patch: Partial<User>) {
    setLocalUsers(prev => prev.map(u => u.id === id ? { ...u, ...patch } : u));
  }

  return (
    <div>
      {/* Фильтры */}
      <form autoComplete="off" onSubmit={e => e.preventDefault()} className="flex flex-wrap gap-3 mb-4 items-center">
        <Input placeholder="Поиск по имени или email..." value={search}
          onChange={e => setSearch(e.target.value)} className="bg-card/50 max-w-xs"
          autoComplete="off" spellCheck={false} type="search"
          name="client-search" id="client-search" data-form-type="other" />
        <div className="flex gap-1">
          {(["all", "active", "blocked", "deleted"] as const).map(f => (
            <button key={f} onClick={() => setFilterStatus(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                filterStatus === f ? "border-primary bg-primary/10 text-primary" : "border-border/30 text-muted-foreground hover:text-foreground"
              }`}>
              {{ all: "Все", active: "Активные", blocked: "Заблокированные", deleted: "Удалённые" }[f]}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} из {localUsers.length}</span>
        {canCreate && (
          <button type="button" onClick={() => setShowCreate(true)}
            className="rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/30">
            + Новый клиент
          </button>
        )}
      </form>

      {showCreate && (
        <CreateClientModal
          onClose={() => setShowCreate(false)}
          onCreated={() => router.refresh()}
        />
      )}

      {/* Таблица */}
      <div className="rounded-xl border border-border/30 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-card/50 border-b border-border/20">
            <tr>
              <th className="text-left p-3">
                <SortBtn
                  field="name"
                  label="Имя"
                  active={sortField === "name"}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </th>
              <th className="text-left p-3">
                <SortBtn
                  field="email"
                  label="Email"
                  active={sortField === "email"}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </th>
              <th className="text-left p-3 text-muted-foreground font-normal text-xs">
                Провайдер
              </th>
              <th className="text-left p-3">
                <SortBtn
                  field="createdAt"
                  label="Регистрация"
                  active={sortField === "createdAt"}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/10">
            {filtered.map(u => (
              <React.Fragment key={u.id}>
                <tr className={`hover:bg-white/3 transition-colors ${expandedId === u.id ? "bg-white/3" : ""}`}>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {u.avatarUrl ? (
                        <img src={u.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                      ) : (
                        <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {u.name[0]}
                        </div>
                      )}
                      <span className="font-medium">{u.name}</span>
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">{u.email}</td>
                  <td className="p-3 text-xs">
                    <Badge variant="outline" className="text-xs">
                      {resolveRegistrationChannel(u)}
                    </Badge>
                  </td>
                  <td className="p-3">
                    {u.blockedAt ? <Badge className="bg-red-500/15 text-red-400 text-xs">Заблокирован</Badge>
                      : u.deletedAt ? <Badge className="bg-muted/30 text-muted-foreground text-xs">Деактивирован</Badge>
                      : u.emailVerified ? <Badge className="bg-green-500/15 text-green-400 text-xs">Активен</Badge>
                      : <Badge className="bg-yellow-500/15 text-yellow-400 text-xs">Не верифицирован</Badge>}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString("ru-RU")}
                  </td>
                  <td className="p-3">
                    {/* Показываем кнопку только если есть хотя бы одно полномочие кроме view */}
                    {(can("clients.edit") || can("clients.block") || can("clients.reset_password") ||
                      can("clients.set_password") || can("clients.view_sessions") || can("clients.view_events")) && (
                      <button onClick={() => setExpandedId(expandedId === u.id ? null : u.id)}
                        className="rounded-lg border border-border/30 px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                        {expandedId === u.id ? "Скрыть" : "Управление"}
                      </button>
                    )}
                  </td>
                </tr>
                {expandedId === u.id && (
                  <tr key={`${u.id}-panel`} className="bg-card/20">
                    <td colSpan={5} className="p-4">
                      <UserActionPanel
                        user={u}
                        adminRole={adminRole}
                        permissions={permissions}
                        onUpdate={patch => updateUser(u.id, patch)}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">Пользователи не найдены</div>
        )}
      </div>
    </div>
  );
}
