"use client";

import { Fragment, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Clock3, ExternalLink, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  CompactHeader,
  CompactPaginationBar,
  CompactTableShell,
  COMPACT_CELL_CLASS,
  COMPACT_INPUT_CLASS,
  COMPACT_SELECT_CLASS,
} from "@/components/admin/compact-table";

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
const PAGE_SIZE = 20;

export function ApplicationsManager({ applications: initial, adminRole }: { applications: Application[]; adminRole: string }) {
  const [apps, setApps] = useState(initial);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    application: "",
    contacts: "",
    specialties: "",
    experience: "",
    status: "all",
    createdAt: "",
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = apps.filter(a => {
    const specialties = a.specialties.map(s => SPECIALTY_LABELS[s] ?? s).join(", ");
    if (filters.status !== "all" && a.status !== filters.status) return false;
    return [
      [filters.application, `${a.name} ${a.about} ${a.why ?? ""}`],
      [filters.contacts, `${a.email} ${a.telegram ?? ""}`],
      [filters.specialties, specialties],
      [filters.experience, a.experience],
      [filters.createdAt, new Date(a.createdAt).toLocaleDateString("ru-RU")],
    ].every(([filter, value]) => !filter || value.toLowerCase().includes(filter.toLowerCase()));
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground text-sm">Нет заявок</div>
      ) : (
        <>
          <CompactTableShell minWidth="1080px">
            <thead>
              <tr>
                <CompactHeader label="Заявка">
                  <HeaderTextFilter value={filters.application} placeholder="имя/текст" onChange={(value) => { setFilters((current) => ({ ...current, application: value })); setPage(1); }} />
                </CompactHeader>
                <CompactHeader label="Контакты">
                  <HeaderTextFilter value={filters.contacts} placeholder="email/telegram" onChange={(value) => { setFilters((current) => ({ ...current, contacts: value })); setPage(1); }} />
                </CompactHeader>
                <CompactHeader label="Специализации">
                  <HeaderTextFilter value={filters.specialties} placeholder="направление" onChange={(value) => { setFilters((current) => ({ ...current, specialties: value })); setPage(1); }} />
                </CompactHeader>
                <CompactHeader label="Опыт">
                  <HeaderTextFilter value={filters.experience} placeholder="опыт" onChange={(value) => { setFilters((current) => ({ ...current, experience: value })); setPage(1); }} />
                </CompactHeader>
                <CompactHeader label="Статус">
                  <div className="p-1 pt-0">
                    <select
                      className={COMPACT_SELECT_CLASS}
                      value={filters.status}
                      onChange={(event) => { setFilters((current) => ({ ...current, status: event.target.value })); setPage(1); }}
                    >
                      <option value="all">Все</option>
                      <option value="PENDING">Новые</option>
                      <option value="REVIEWING">На проверке</option>
                      <option value="APPROVED">Одобренные</option>
                      <option value="REJECTED">Отклонённые</option>
                    </select>
                  </div>
                </CompactHeader>
                <CompactHeader label="Создано">
                  <HeaderTextFilter value={filters.createdAt} placeholder="дд.мм.гггг" onChange={(value) => { setFilters((current) => ({ ...current, createdAt: value })); setPage(1); }} />
                </CompactHeader>
                <CompactHeader label="Действия" />
              </tr>
            </thead>
            <tbody>
              {pageRows.map(a => {
                const isExpanded = expandedId === a.id;
                const meta = STATUS_META[a.status] ?? STATUS_META.PENDING;
                const specialties = a.specialties.map(s => SPECIALTY_LABELS[s] ?? s).join(", ");
                return (
                  <Fragment key={a.id}>
                    <tr>
                      <td className={COMPACT_CELL_CLASS}>
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
                      <td className={COMPACT_CELL_CLASS}>
                        <span className="soft-admin-cell-truncate">{a.email}</span>
                        {a.telegram ? <span className="soft-admin-cell-muted">{a.telegram}</span> : null}
                      </td>
                      <td className={COMPACT_CELL_CLASS} title={specialties}>{specialties}</td>
                      <td className={COMPACT_CELL_CLASS} title={a.experience}>{a.experience}</td>
                      <td className={COMPACT_CELL_CLASS}><Badge className={`${meta.color} text-xs`}>{meta.label}</Badge></td>
                      <td className={`${COMPACT_CELL_CLASS} whitespace-nowrap`}>{new Date(a.createdAt).toLocaleDateString("ru-RU")}</td>
                      <td className={`${COMPACT_CELL_CLASS} border-r-0`}>
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
          </CompactTableShell>
          <CompactPaginationBar page={safePage} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}
    </div>
  );
}

function HeaderTextFilter({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="p-1 pt-0">
      <input
        className={COMPACT_INPUT_CLASS}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
