"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface Application {
  id: string;
  kind: "APPLICATION" | "VERIFICATION";
  verificationPractitionerId: string | null;
  name: string;
  email: string;
  telegram: string | null;
  specialties: string[];
  experience: string;
  formats: string[];
  about: string;
  why: string | null;
  portfolio: string | null;
  attachments?: string[];
  status: string;
  createdAt: string;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING:   { label: "Новая",      color: "bg-yellow-500/10 text-yellow-400" },
  REVIEWING: { label: "На проверке",color: "bg-blue-500/10 text-blue-400" },
  APPROVED:  { label: "Одобрена",   color: "bg-green-500/10 text-green-400" },
  REJECTED:  { label: "Отклонена",  color: "bg-red-500/10 text-red-400" },
};

const SPECIALTY_LABELS: Record<string, string> = {
  TAROT: "Таро", ASTROLOGY: "Астрология", NUMEROLOGY: "Нумерология",
  PSYCHIC: "Экстрасенсорика", RUNES: "Руны", DREAMS: "Сонники",
};

export function ApplicationsManager({ applications: initial, adminRole }: { applications: Application[]; adminRole: string }) {
  const [apps, setApps] = useState(initial);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = apps.filter(a => {
    if (filterStatus !== "all" && a.status !== filterStatus) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q) || a.about.toLowerCase().includes(q);
  });

  async function updateStatus(id: string, status: string) {
    const res = await fetch(`/api/admin/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const d = await res.json();
    if (d.ok) {
      setApps(prev => prev.map(a => a.id === id ? { ...a, status } : a));
      if (d.verificationCompleted) {
        toast.success("Практик верифицирован · статус появится в кабинете и публичной карточке");
      } else if (d.accountCreated) {
        toast.success(
          `Аккаунт практика создан · письмо со ссылкой на установку пароля отправлено на ${d.practitioner?.email ?? "указанный email"}`,
        );
      } else {
        toast.success(`Статус изменён: ${STATUS_META[status]?.label}`);
      }
    } else toast.error(d.error ?? "Ошибка");
  }

  return (
    <div className="space-y-4">
      {/* Фильтры */}
      <div className="flex flex-wrap gap-3 items-center">
        <Input placeholder="Поиск по имени, email, тексту..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="bg-card/50 max-w-xs h-8 text-sm" />
        <div className="soft-admin-seg">
          {[["all", "Все"], ["PENDING", "Новые"], ["REVIEWING", "На проверке"], ["APPROVED", "Одобренные"], ["REJECTED", "Отклонённые"]].map(([v, l]) => (
            <button key={v} onClick={() => setFilterStatus(v)}
              data-active={filterStatus === v}
              className="soft-admin-seg-btn">
              {l}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length}</span>
      </div>

      {/* Список */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground text-sm">Нет заявок</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(a => {
            const isExpanded = expandedId === a.id;
            const meta = STATUS_META[a.status] ?? STATUS_META.PENDING;
            return (
              <div key={a.id} className="rounded-xl border border-border/30 bg-card/20 overflow-hidden">
                {/* Заголовок */}
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : a.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-medium">{a.name}</p>
                      <Badge className={`${meta.color} text-xs`}>{meta.label}</Badge>
                      {a.kind === "VERIFICATION" && (
                        <Badge className="bg-primary/10 text-primary text-xs">Верификация</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {a.email}
                      {a.telegram && ` · ${a.telegram}`}
                      {" · "}
                      {a.specialties.map(s => SPECIALTY_LABELS[s] ?? s).join(", ")}
                      {" · "}
                      {a.experience}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {new Date(a.createdAt).toLocaleDateString("ru-RU")}
                    </span>
                    <span className="text-muted-foreground/40 text-xs">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Детали */}
                {isExpanded && (
                  <div className="border-t border-border/20 px-4 pb-4 pt-3 space-y-4">
                    {/* О себе */}
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">О себе</p>
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{a.about}</p>
                    </div>

                    {a.kind === "VERIFICATION" && (
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Тип заявки</p>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          Практик просит подтвердить личность/документы. При одобрении будет выставлен флаг verified.
                        </p>
                      </div>
                    )}

                    {a.why && a.kind !== "VERIFICATION" && (
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Почему ETerapy</p>
                        <p className="text-sm text-muted-foreground leading-relaxed">{a.why}</p>
                      </div>
                    )}

                    {(a.portfolio || a.formats.length > 0) && (
                      <div className="flex gap-6 flex-wrap">
                        {a.portfolio && (
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Портфолио</p>
                            <a href={a.portfolio.startsWith("http") ? a.portfolio : `https://${a.portfolio}`}
                              target="_blank" className="text-sm text-primary hover:underline">{a.portfolio}</a>
                          </div>
                        )}
                        {a.formats.length > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Форматы</p>
                            <p className="text-sm text-muted-foreground">{a.formats.join(", ")}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Y5: verification documents uploaded by the practitioner. */}
                    {a.attachments && a.attachments.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Документы ({a.attachments.length})</p>
                        <div className="flex flex-wrap gap-2">
                          {a.attachments.map((url, i) => (
                            <a
                              key={url}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-primary hover:underline"
                            >
                              Документ {i + 1}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Действия */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-border/10">
                      {a.status !== "REVIEWING" && (
                        <button onClick={() => updateStatus(a.id, "REVIEWING")}
                          className="rounded-lg border border-blue-500/30 px-3 py-1.5 text-xs text-blue-400 hover:bg-blue-500/10">
                          На проверку
                        </button>
                      )}
                      {a.status !== "APPROVED" && (
                        <button onClick={() => updateStatus(a.id, "APPROVED")}
                          className="rounded-lg border border-green-500/30 px-3 py-1.5 text-xs text-green-400 hover:bg-green-500/10">
                          ✓ Одобрить
                        </button>
                      )}
                      {a.status !== "REJECTED" && (
                        <button onClick={() => updateStatus(a.id, "REJECTED")}
                          className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10">
                          Отклонить
                        </button>
                      )}
                      {a.status === "APPROVED" && adminRole === "SUPERADMIN" && (
                        <a href={`/admin/product/users?role=PRACTITIONER&q=${encodeURIComponent(a.email)}`}
                          className="rounded-lg border border-primary/40 px-3 py-1.5 text-xs text-primary hover:bg-primary/10">
                          Открыть аккаунт практика →
                        </a>
                      )}
                    </div>
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
