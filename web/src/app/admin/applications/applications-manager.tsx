"use client";

import { Fragment, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Clock3, ExternalLink, XCircle } from "lucide-react";
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
        <div className="overflow-x-auto rounded-lg border border-[var(--soft-paper-edge)]">
          <table className="soft-admin-data-table min-w-[1080px]">
            <thead>
              <tr>
                <th>Заявка</th>
                <th>Контакты</th>
                <th>Специализации</th>
                <th>Опыт</th>
                <th>Статус</th>
                <th>Создано</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => {
                const isExpanded = expandedId === a.id;
                const meta = STATUS_META[a.status] ?? STATUS_META.PENDING;
                const specialties = a.specialties.map(s => SPECIALTY_LABELS[s] ?? s).join(", ");
                return (
                  <Fragment key={a.id}>
                    <tr>
                      <td>
                        <button
                          type="button"
                          className="mr-1 inline-flex size-6 items-center justify-center rounded border border-[var(--soft-paper-edge)] bg-white align-middle text-[var(--soft-bordeaux)]"
                          onClick={() => setExpandedId(isExpanded ? null : a.id)}
                          aria-label={isExpanded ? "Свернуть заявку" : "Раскрыть заявку"}
                          title={isExpanded ? "Свернуть" : "Раскрыть"}
                        >
                          {isExpanded ? <ChevronDown className="size-3.5" aria-hidden="true" /> : <ChevronRight className="size-3.5" aria-hidden="true" />}
                        </button>
                        <span className="font-medium">{a.name}</span>
                        {a.kind === "VERIFICATION" && <span className="ml-2 soft-admin-status-pill">Верификация</span>}
                      </td>
                      <td>
                        <span className="soft-admin-cell-truncate">{a.email}</span>
                        {a.telegram ? <span className="soft-admin-cell-muted">{a.telegram}</span> : null}
                      </td>
                      <td title={specialties}>{specialties}</td>
                      <td title={a.experience}>{a.experience}</td>
                      <td><Badge className={`${meta.color} text-xs`}>{meta.label}</Badge></td>
                      <td>{new Date(a.createdAt).toLocaleDateString("ru-RU")}</td>
                      <td>
                        <div className="soft-admin-table-actions">
                          {a.status !== "REVIEWING" && (
                            <button type="button" onClick={() => updateStatus(a.id, "REVIEWING")} className="soft-admin-icon-button" title="На проверку" aria-label="Перевести заявку на проверку">
                              <Clock3 className="size-3.5" aria-hidden="true" />
                            </button>
                          )}
                          {a.status !== "APPROVED" && (
                            <button type="button" onClick={() => updateStatus(a.id, "APPROVED")} className="soft-admin-icon-button" data-variant="primary" title="Одобрить" aria-label="Одобрить заявку">
                              <CheckCircle2 className="size-3.5" aria-hidden="true" />
                            </button>
                          )}
                          {a.status !== "REJECTED" && (
                            <button type="button" onClick={() => updateStatus(a.id, "REJECTED")} className="soft-admin-icon-button" data-variant="danger" title="Отклонить" aria-label="Отклонить заявку">
                              <XCircle className="size-3.5" aria-hidden="true" />
                            </button>
                          )}
                          {a.status === "APPROVED" && adminRole === "SUPERADMIN" && (
                            <a href={`/admin/product/users?role=PRACTITIONER&q=${encodeURIComponent(a.email)}`} className="soft-admin-icon-button" title="Открыть аккаунт практика" aria-label="Открыть аккаунт практика">
                              <ExternalLink className="size-3.5" aria-hidden="true" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${a.id}-details`} className="soft-admin-row-details">
                        <td colSpan={7}>
                          <div className="grid gap-4 p-4 lg:grid-cols-2">
                            <div>
                              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">О себе</p>
                              <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{a.about}</p>
                            </div>
                            <div className="space-y-3">
                              {a.kind === "VERIFICATION" && (
                                <div>
                                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Тип заявки</p>
                                  <p className="text-sm leading-relaxed text-muted-foreground">
                                    Практик просит подтвердить личность/документы. При одобрении будет выставлен флаг verified.
                                  </p>
                                </div>
                              )}
                              {a.why && a.kind !== "VERIFICATION" && (
                                <div>
                                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Почему ETerapy</p>
                                  <p className="text-sm leading-relaxed text-muted-foreground">{a.why}</p>
                                </div>
                              )}
                              {(a.portfolio || a.formats.length > 0) && (
                                <div className="flex flex-wrap gap-6">
                                  {a.portfolio && (
                                    <div className="min-w-0">
                                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Портфолио</p>
                                      <a href={a.portfolio.startsWith("http") ? a.portfolio : `https://${a.portfolio}`} target="_blank" className="block max-w-xs truncate text-sm text-primary hover:underline">
                                        {a.portfolio}
                                      </a>
                                    </div>
                                  )}
                                  {a.formats.length > 0 && (
                                    <div>
                                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Форматы</p>
                                      <p className="text-sm text-muted-foreground">{a.formats.join(", ")}</p>
                                    </div>
                                  )}
                                </div>
                              )}
                              {a.attachments && a.attachments.length > 0 && (
                                <div>
                                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Документы ({a.attachments.length})</p>
                                  <div className="flex flex-wrap gap-2">
                                    {a.attachments.map((url, i) => (
                                      <a key={url} href={url} target="_blank" rel="noreferrer" className="soft-admin-action" data-variant="subtle">
                                        Документ {i + 1}
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
