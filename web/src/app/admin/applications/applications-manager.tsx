"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { AdminCompactDataTable, type AdminCompactColumn } from "@/components/admin/compact-client-table";
import { dispatchAdminCountsChanged } from "@/lib/admin-counts-events";

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

const STATUS_META: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  PENDING: { label: "Новая", tone: "warn" },
  REVIEWING: { label: "На проверке", tone: "warn" },
  APPROVED: { label: "Одобрена", tone: "ok" },
  REJECTED: { label: "Отклонена", tone: "danger" },
};

const STATUS_OPTIONS = [
  { value: "PENDING", label: "Новые" },
  { value: "REVIEWING", label: "На проверке" },
  { value: "APPROVED", label: "Одобренные" },
  { value: "REJECTED", label: "Отклонённые" },
];

const SPECIALTY_LABELS: Record<string, string> = {
  TAROT: "Таро",
  ASTROLOGY: "Астрология",
  NUMEROLOGY: "Нумерология",
  PSYCHIC: "Экстрасенсорика",
  RUNES: "Руны",
  DREAMS: "Сонники",
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU");
}

export function ApplicationsManager({ applications: initial, adminRole }: { applications: Application[]; adminRole: string }) {
  const [apps, setApps] = useState(initial);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const specialtyOptions = useMemo(() => {
    const values = new Map<string, string>();
    for (const app of apps) {
      for (const specialty of app.specialties) values.set(specialty, SPECIALTY_LABELS[specialty] ?? specialty);
    }
    return [...values.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }, [apps]);

  const columns = useMemo<AdminCompactColumn[]>(() => [
    { key: "application", label: "Заявка", sortable: true },
    { key: "contacts", label: "Контакты", sortable: true },
    { key: "specialties", label: "Специализации", sortable: true, filterKind: "select", options: specialtyOptions },
    { key: "experience", label: "Опыт", sortable: true },
    { key: "status", label: "Статус", sortable: true, filterKind: "select", options: STATUS_OPTIONS },
    { key: "createdAt", label: "Создано", sortable: true, filterKind: "date" },
    { key: "actions", label: "Действия", filterKind: "none", align: "center" },
  ], [specialtyOptions]);

  async function updateStatus(id: string, status: string) {
    const response = await fetch(`/api/admin/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const payload = await response.json();
    if (payload.ok) {
      setApps((current) => current.map((app) => (app.id === id ? { ...app, status } : app)));
      dispatchAdminCountsChanged();
      if (payload.verificationCompleted) {
        toast.success("Практик верифицирован");
      } else if (payload.accountCreated) {
        toast.success(`Аккаунт практика создан · письмо отправлено на ${payload.practitioner?.email ?? "указанный email"}`);
      } else {
        toast.success(`Статус изменён: ${STATUS_META[status]?.label}`);
      }
    } else {
      toast.error(payload.error ?? "Ошибка");
    }
  }

  return (
    <div className="space-y-4">
      <AdminCompactDataTable
        columns={columns}
        rows={apps.map((app) => {
          const isExpanded = expandedId === app.id;
          const meta = STATUS_META[app.status] ?? STATUS_META.PENDING;
          const specialties = app.specialties.map((specialty) => SPECIALTY_LABELS[specialty] ?? specialty).join(", ");
          return {
            id: app.id,
            cells: {
              application: {
                kind: "node",
                filterValue: `${app.name} ${app.about} ${app.why ?? ""}`,
                sortValue: app.name,
                node: (
                  <span className="block min-w-[18rem]">
                    <button
                      type="button"
                      className="mr-1 inline-flex size-6 items-center justify-center rounded border border-[var(--soft-paper-edge)] bg-white align-middle text-[var(--soft-bordeaux)]"
                      onClick={() => setExpandedId(isExpanded ? null : app.id)}
                      aria-label={isExpanded ? "Свернуть заявку" : "Раскрыть заявку"}
                      title={isExpanded ? "Свернуть" : "Раскрыть"}
                    >
                      {isExpanded ? <ChevronDown className="size-3.5" aria-hidden="true" /> : <ChevronRight className="size-3.5" aria-hidden="true" />}
                    </button>
                    <span className="font-medium">{app.name}</span>
                    {app.kind === "VERIFICATION" ? <span className="ml-2 soft-admin-status-pill">Верификация</span> : null}
                    {isExpanded ? (
                      <span className="application-detail-grid mt-3 grid max-w-[46rem] gap-3 whitespace-normal break-words rounded-md border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-3 text-xs text-[var(--soft-ink-soft)]">
                        <span><b className="text-[var(--soft-ink)]">О себе:</b> {app.about}</span>
                        {app.kind === "VERIFICATION" ? <span>Практик просит подтвердить личность/документы.</span> : null}
                        {app.why && app.kind !== "VERIFICATION" ? <span><b className="text-[var(--soft-ink)]">Почему ETerapy:</b> {app.why}</span> : null}
                        {app.formats.length > 0 ? <span><b className="text-[var(--soft-ink)]">Форматы:</b> {app.formats.join(", ")}</span> : null}
                        {app.portfolio ? (
                          <a href={app.portfolio.startsWith("http") ? app.portfolio : `https://${app.portfolio}`} target="_blank" rel="noreferrer" className="text-[var(--soft-bordeaux)] hover:underline">
                            Портфолио: {app.portfolio}
                          </a>
                        ) : null}
                        {app.attachments && app.attachments.length > 0 ? (
                          <span className="flex flex-wrap gap-2">
                            <span className="w-full font-medium text-[var(--soft-ink)]">Документы ({app.attachments.length})</span>
                            {app.attachments.map((url, index) => (
                              <a key={url} href={url} target="_blank" rel="noreferrer" className="soft-admin-action" data-variant="subtle">
                                Документ {index + 1}
                              </a>
                            ))}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                ),
              },
              contacts: { value: app.email, subvalue: app.telegram, filterValue: `${app.email} ${app.telegram ?? ""}` },
              specialties: { value: specialties, filterValue: `${app.specialties.join(" ")} ${specialties}`, sortValue: specialties },
              experience: { value: app.experience, title: app.experience },
              status: { kind: "status", label: meta.label, tone: meta.tone, filterValue: app.status, sortValue: meta.label },
              createdAt: { value: formatDate(app.createdAt), sortValue: new Date(app.createdAt).getTime(), filterValue: formatDate(app.createdAt) },
              actions: {
                kind: "actions",
                actions: [
                  ...(app.status !== "REVIEWING" ? [{ label: "На проверку", icon: "refresh" as const, onClick: () => { void updateStatus(app.id, "REVIEWING"); } }] : []),
                  ...(app.status !== "APPROVED" ? [{ label: "Одобрить", icon: "check" as const, variant: "primary" as const, onClick: () => { void updateStatus(app.id, "APPROVED"); } }] : []),
                  ...(app.status !== "REJECTED" ? [{ label: "Отклонить", icon: "cancel" as const, variant: "danger" as const, onClick: () => { void updateStatus(app.id, "REJECTED"); } }] : []),
                  ...(app.status === "APPROVED" && adminRole === "SUPERADMIN" ? [{
                    label: "Открыть аккаунт практика",
                    icon: "open" as const,
                    href: `/admin/product/users?role=PRACTITIONER&q=${encodeURIComponent(app.email)}`,
                  }] : []),
                ],
              },
            },
          };
        })}
        empty="Нет заявок"
        minWidth="1120px"
      />
    </div>
  );
}
