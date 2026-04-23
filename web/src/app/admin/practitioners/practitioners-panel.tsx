"use client";

import React, { useState, useMemo } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PractitionerActionPanel } from "./practitioner-action-panel";
import { CreatePractitionerForm } from "./create-practitioner-form";
import type { Permission } from "@/lib/moderator-permissions";

interface Practitioner {
  id: string;
  userId: string;
  slug: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  userBlockedAt: string | null;
  status: string;
  title: string;
  bio: string;
  experience: string;
  specialties: string[];
  tags: string[];
  pricePerSession: number;
  sessionDuration: number;
  commissionPercent: number;
  verified: boolean;
  founding: boolean;
  reviewCount: number;
  sessionCount: number;
  avgRating: number | null;
  openComplaintCount: number;
  accruedNet: number;
  paidOut: number;
  pendingPayout: number;
  currentBalance: number;
  minRate: number | null;
  minRateDuration: number | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:    "bg-green-500/10 text-green-400",
  PENDING:   "bg-yellow-500/10 text-yellow-400",
  SUSPENDED: "bg-destructive/10 text-destructive",
  BLOCKED:   "bg-red-500/10 text-red-400",
};
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Активен", PENDING: "На проверке", SUSPENDED: "Деактивирован", BLOCKED: "Заблокирован",
};

function SortBtn({
  field,
  label,
  active,
  sortDir,
  onSort,
}: {
  field: "name" | "createdAt" | "sessionCount";
  label: string;
  active: boolean;
  sortDir: "asc" | "desc";
  onSort: (field: "name" | "createdAt" | "sessionCount") => void;
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

export function PractitionersPanel({
  practitioners,
  adminRole,
  permissions,
}: {
  practitioners: Practitioner[];
  adminRole: string;
  permissions: Permission[];
}) {
  const can = (p: Permission) => permissions.includes(p);
  const [list, setList] = useState(practitioners);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] =
    useState<"name" | "createdAt" | "sessionCount">("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const filtered = useMemo(() => {
    let arr = [...list];
    const q = search.toLowerCase();
    if (q)
      arr = arr.filter(
        p =>
          p.name.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          p.title.toLowerCase().includes(q)
      );
    if (filterStatus !== "all") arr = arr.filter(p => p.status === filterStatus);
    arr.sort((a, b) => {
      if (sortField === "name")
        return sortDir === "asc"
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
      if (sortField === "sessionCount")
        return sortDir === "asc"
          ? a.sessionCount - b.sessionCount
          : b.sessionCount - a.sessionCount;
      return sortDir === "asc"
        ? a.createdAt.localeCompare(b.createdAt)
        : b.createdAt.localeCompare(a.createdAt);
    });
    return arr;
  }, [list, search, filterStatus, sortField, sortDir]);

  function handleSort(field: "name" | "createdAt" | "sessionCount") {
    if (sortField === field) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  async function handleStatusChange(practitionerId: string, status: string) {
    const res = await fetch(`/api/admin/practitioners/${practitionerId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const d = await res.json();
    if (d.ok) {
      setList(prev => prev.map(p => p.id === practitionerId ? { ...p, status } : p));
      toast.success("Статус обновлён");
    } else toast.error(d.error ?? "Ошибка");
  }

  return (
    <div className="space-y-4">
      {/* Создать практика — суперадмин или moderator с practitioners.create */}
      {can("practitioners.create") && (
        <button onClick={() => setShowCreate(!showCreate)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-navy">
          + Создать практика
        </button>
      )}

      {showCreate && (
        <CreatePractitionerForm
          onClose={() => setShowCreate(false)}
          onCreated={(p) => {
            setList(prev => [...prev, { ...p } as Practitioner]);
            setShowCreate(false);
          }}
        />
      )}

      {/* Фильтры */}
      <form autoComplete="off" onSubmit={e => e.preventDefault()} className="flex flex-wrap gap-3 items-center">
        <Input placeholder="Поиск по имени, email, специализации..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="bg-card/50 max-w-xs h-8 text-sm"
          name="practitioner-search" id="practitioner-search" autoComplete="off" data-form-type="other" />
        <div className="flex gap-1">
          {["all", "PENDING", "ACTIVE", "SUSPENDED", "BLOCKED"].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`rounded-lg px-3 py-1 text-xs transition-colors ${
                filterStatus === s ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}>
              {s === "all" ? "Все" : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <div className="flex gap-3 ml-auto">
          <SortBtn
            field="name"
            label="Имя"
            active={sortField === "name"}
            sortDir={sortDir}
            onSort={handleSort}
          />
          <SortBtn
            field="sessionCount"
            label="Сессии"
            active={sortField === "sessionCount"}
            sortDir={sortDir}
            onSort={handleSort}
          />
          <SortBtn
            field="createdAt"
            label="Дата"
            active={sortField === "createdAt"}
            sortDir={sortDir}
            onSort={handleSort}
          />
        </div>
      </form>

      {/* Счётчик */}
      <p className="text-xs text-muted-foreground">Показано: {filtered.length} из {list.length}</p>

      {/* Таблица */}
      <div className="rounded-xl border border-border/30 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-card/30 border-b border-border/20">
            <tr>
              <th className="text-left p-3 text-xs text-muted-foreground font-medium">Практик</th>
              <th className="text-left p-3 text-xs text-muted-foreground font-medium">Статус</th>
              <th className="text-left p-3 text-xs text-muted-foreground font-medium">Специализация</th>
              <th className="text-left p-3 text-xs text-muted-foreground font-medium">Сессии</th>
              <th className="text-left p-3 text-xs text-muted-foreground font-medium">Рейтинг</th>
              <th className="text-left p-3 text-xs text-muted-foreground font-medium">Жалобы</th>
              <th className="text-left p-3 text-xs text-muted-foreground font-medium">Баланс</th>
              <th className="text-left p-3 text-xs text-muted-foreground font-medium">Тариф (мин)</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/10">
            {filtered.map(p => (
              <React.Fragment key={p.id}>
                <tr className={`hover:bg-white/3 transition-colors ${expandedId === p.id ? "bg-white/3" : ""}`}>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {p.avatarUrl ? (
                        <img src={p.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {p.name[0]}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{p.name}</span>
                          {p.verified && <span className="text-primary text-xs">✓</span>}
                          {p.userBlockedAt && <Badge className="bg-red-500/15 text-red-400 text-[10px] py-0">заблок.</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">{p.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge className={`${STATUS_COLORS[p.status] ?? ""} text-xs`}>
                      {STATUS_LABELS[p.status] ?? p.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground max-w-[180px]">
                    <p className="truncate">{p.title}</p>
                    <p className="text-[10px] opacity-60">{p.specialties.slice(0,2).join(", ")}</p>
                  </td>
                  <td className="p-3 text-center">
                    <span className="text-sm font-medium">{p.sessionCount}</span>
                    <p className="text-[10px] text-muted-foreground">{p.reviewCount} отзывов</p>
                  </td>
                  <td className="p-3 text-xs">
                    {p.avgRating != null ? (
                      <span className="font-medium text-yellow-400">★ {p.avgRating.toFixed(1)}</span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="p-3 text-xs">
                    {p.openComplaintCount > 0 ? (
                      <Badge className="bg-red-500/15 text-red-400 text-[10px] py-0">{p.openComplaintCount}</Badge>
                    ) : <span className="text-muted-foreground">0</span>}
                  </td>
                  <td className="p-3 text-xs">
                    <span className={p.currentBalance > 0 ? "text-primary font-medium" : "text-muted-foreground"}>
                      {p.currentBalance.toLocaleString("ru")} ₽
                    </span>
                    {p.pendingPayout > 0 && (
                      <p className="text-[10px] text-yellow-400">+{p.pendingPayout.toLocaleString("ru")} ₽ в пути</p>
                    )}
                  </td>
                  <td className="p-3 text-xs">
                    {p.minRate != null ? (
                      <span className="text-primary font-medium">{p.minRate.toLocaleString("ru")} ₽/{p.minRateDuration}мин</span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2 items-center justify-end">
                      <a href={`/api/admin/impersonate?userId=${p.userId}`} target="_blank"
                        className="text-xs text-primary hover:underline font-medium">
                        Войти как практик ↗
                      </a>
                      <a href={`/practitioners/${p.slug}`} target="_blank"
                        className="text-xs text-muted-foreground hover:text-primary transition-colors">
                        Профиль ↗
                      </a>
                      {(can("practitioners.edit") || can("practitioners.block") ||
                        can("practitioners.reset_password") || can("practitioners.set_password") ||
                        can("practitioners.set_rates") || can("practitioners.payout") ||
                        can("practitioners.view_earnings")) && (
                        <button onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                          className="rounded-lg border border-border/30 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
                          {expandedId === p.id ? "Скрыть" : "Управление"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {expandedId === p.id && (
                  <tr>
                    <td colSpan={9} className="bg-card/10 p-4 border-b border-border/20">
                      <PractitionerActionPanel
                        practitioner={p}
                        adminRole={adminRole}
                        permissions={permissions}
                        onStatusChange={(s) => handleStatusChange(p.id, s)}
                        onUpdate={(patch) => setList(prev => prev.map(x => x.id === p.id ? { ...x, ...patch } : x))}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-muted-foreground text-sm">Нет практиков</div>
        )}
      </div>
    </div>
  );
}
