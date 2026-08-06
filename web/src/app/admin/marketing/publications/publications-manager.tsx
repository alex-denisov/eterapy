"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  AdminCompactDataTable,
  type AdminCompactColumn,
  type AdminCompactRow,
} from "@/components/admin/compact-client-table";
import type { ExternalPublicationRegistry } from "@/lib/external-publications";
import {
  PUBLICATION_CONTENT_TYPES,
  PUBLICATION_INDEX_STATUSES,
  PUBLICATION_PLATFORMS,
  PUBLICATION_STATUSES,
  archiveReasonLabel,
} from "@/lib/external-publication-shared";
import {
  createExternalPublicationAction,
  updateExternalPublicationAction,
} from "./actions";

type RegistryRow = ExternalPublicationRegistry["rows"][number];

const platformLabels: Record<string, string> = {
  DZEN: "Дзен",
  VK: "VK",
  TELEGRAM: "Telegram",
  REDDIT: "Reddit",
  THREADS: "Threads",
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
  MEDIA: "СМИ",
  DIRECTORY: "Каталог",
  OTHER: "Другое",
};

const statusLabels: Record<string, string> = {
  PLANNED: "Запланировано",
  DRAFT: "Черновик",
  REVIEW: "На премодерации",
  SCHEDULED: "Утверждено",
  // B654: у площадки нет автоматического выпуска — материал готов и ждёт
  // человека. Это не пауза и не отказ.
  MANUAL: "Ждёт ручной публикации",
  PUBLISHING: "Публикуется",
  FAILED: "Ошибка",
  PUBLISHED: "Опубликовано",
  PAUSED: "Пауза",
  ARCHIVED: "Архив",
};

const indexLabels: Record<string, string> = {
  UNKNOWN: "Не проверено",
  NOT_INDEXED: "Не в индексе",
  DISCOVERED: "Обнаружено",
  INDEXED: "В индексе",
  EXCLUDED: "Исключено",
};

const contentLabels: Record<string, string> = {
  ARTICLE: "Статья",
  POST: "Пост",
  COMMENT: "Комментарий",
  INBOUND_REPLY: "Ответ на входящее",
  VIDEO: "Видео",
  PROFILE: "Профиль",
  DIRECTORY_CARD: "Карточка каталога",
  OTHER: "Другое",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function inputClass() {
  return "min-h-10 w-full rounded-lg border border-[#D6DEE9] bg-white px-3 text-sm text-slate-900 outline-none focus:bg-slate-50";
}

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? "md:col-span-2" : ""}>
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function UpdatePanel({ row, onDone }: { row: RegistryRow; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-3 border-t border-slate-200 bg-slate-50/80 p-4 md:grid-cols-3"
      action={(formData) => startTransition(async () => {
        const result = await updateExternalPublicationAction(formData);
        if (result.ok) toast.success(result.message);
        else toast.error(result.message);
        if (result.ok) onDone();
      })}
    >
      <input type="hidden" name="publicationId" value={row.id} />
      <Field label="Статус публикации">
        <select name="status" defaultValue={row.status} className={inputClass()}>
          {PUBLICATION_STATUSES.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}
        </select>
      </Field>
      <Field label="Индексация">
        <select name="indexStatus" defaultValue={row.indexStatus} className={inputClass()}>
          {PUBLICATION_INDEX_STATUSES.map((value) => <option key={value} value={value}>{indexLabels[value]}</option>)}
        </select>
      </Field>
      <Field label="Проверено в поиске">
        <input name="lastIndexCheckAt" type="datetime-local" defaultValue={toLocalInput(row.lastIndexCheckAt)} className={inputClass()} />
      </Field>
      <Field label="Следующий контроль">
        <input name="nextReviewAt" type="datetime-local" defaultValue={toLocalInput(row.nextReviewAt)} className={inputClass()} />
      </Field>
      <Field label="Плановая дата публикации">
        <input name="scheduledFor" type="datetime-local" defaultValue={toLocalInput(row.scheduledFor)} className={inputClass()} />
      </Field>
      <Field label="Публичная ссылка" wide>
        <input name="publicUrl" type="url" defaultValue={row.publicUrl ?? ""} className={inputClass()} />
      </Field>
      <Field label="Медиа для публикации" wide>
        <input name="mediaUrl" type="url" defaultValue={row.mediaUrl ?? ""} placeholder="https://..." className={inputClass()} />
      </Field>
      <Field label="Текст материала" wide>
        <textarea name="body" rows={8} defaultValue={row.body ?? ""} className={`${inputClass()} py-2`} />
      </Field>
      <Field label="Заметки" wide>
        <textarea name="notes" rows={3} defaultValue={row.notes ?? ""} className={`${inputClass()} py-2`} />
      </Field>
      <div className="md:col-span-3 border-t border-slate-200 pt-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Новый срез внешних метрик · пустые поля не изменяют историю</p>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["reach", "Охват"], ["views", "Просмотры"], ["reactions", "Реакции"],
            ["comments", "Комментарии"], ["shares", "Репосты"], ["outboundClicks", "Клики"],
          ].map(([name, label]) => (
            <label key={name}>
              <span className="mb-1 block text-[0.68rem] font-semibold text-slate-600">{label}</span>
              <input name={name} type="number" min="0" inputMode="numeric" className={inputClass()} />
            </label>
          ))}
        </div>
        <input name="metricRecordedAt" type="hidden" value={toLocalInput(new Date().toISOString())} />
      </div>
      <div className="flex justify-end gap-2 md:col-span-3">
        <button type="button" className="soft-admin-action" onClick={onDone}>Закрыть</button>
        <button type="submit" disabled={pending} className="soft-admin-action" data-variant="primary">
          {pending ? "Сохраняю…" : "Сохранить"}
        </button>
      </div>
    </form>
  );
}

function CreatePanel({ onDone }: { onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-3 rounded-lg border border-[#D6DEE9] bg-slate-50/75 p-4 md:grid-cols-3"
      action={(formData) => startTransition(async () => {
        const result = await createExternalPublicationAction(formData);
        if (result.ok) toast.success(result.message);
        else toast.error(result.message);
        if (result.ok) onDone();
      })}
    >
      <Field label="Стабильный ключ">
        <input name="key" required minLength={3} placeholder="vk-first-post-2026-07-23" className={inputClass()} />
      </Field>
      <Field label="Площадка">
        <select name="platform" defaultValue="VK" className={inputClass()}>
          {PUBLICATION_PLATFORMS.map((value) => <option key={value} value={value}>{platformLabels[value]}</option>)}
        </select>
      </Field>
      <Field label="Формат">
        <select name="contentType" defaultValue="POST" className={inputClass()}>
          {PUBLICATION_CONTENT_TYPES.map((value) => <option key={value} value={value}>{contentLabels[value]}</option>)}
        </select>
      </Field>
      <Field label="Заголовок" wide>
        <input name="title" required minLength={8} placeholder="Человеческое название материала" className={inputClass()} />
      </Field>
      <Field label="Канал / сообщество">
        <input name="channelName" placeholder="ETerapy" className={inputClass()} />
      </Field>
      <Field label="Статус">
        <select name="status" defaultValue="PLANNED" className={inputClass()}>
          {PUBLICATION_STATUSES.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}
        </select>
      </Field>
      <Field label="Индексация">
        <select name="indexStatus" defaultValue="UNKNOWN" className={inputClass()}>
          {PUBLICATION_INDEX_STATUSES.map((value) => <option key={value} value={value}>{indexLabels[value]}</option>)}
        </select>
      </Field>
      <Field label="Публичная ссылка" wide>
        <input name="publicUrl" type="url" placeholder="https://..." className={inputClass()} />
      </Field>
      <Field label="Целевая страница с UTM" wide>
        <input name="destinationUrl" type="url" placeholder="https://eterapy.com/...?utm_source=..." className={inputClass()} />
      </Field>
      <Field label="Медиа для публикации" wide>
        <input name="mediaUrl" type="url" placeholder="https://... (обязательно для Instagram)" className={inputClass()} />
      </Field>
      <Field label="utm_source"><input name="utmSource" placeholder="vk" className={inputClass()} /></Field>
      <Field label="utm_medium"><input name="utmMedium" placeholder="organic" className={inputClass()} /></Field>
      <Field label="utm_campaign"><input name="utmCampaign" placeholder="relationship_silence" className={inputClass()} /></Field>
      <Field label="Целевой запрос"><input name="targetQuery" placeholder="почему он перестал писать" className={inputClass()} /></Field>
      <Field label="Контент-кластер"><input name="cluster" placeholder="Отношения" className={inputClass()} /></Field>
      <Field label="Опубликовано"><input name="publishedAt" type="datetime-local" className={inputClass()} /></Field>
      <Field label="Плановая дата публикации"><input name="scheduledFor" type="datetime-local" className={inputClass()} /></Field>
      <Field label="Следующий контроль"><input name="nextReviewAt" type="datetime-local" className={inputClass()} /></Field>
      <Field label="Текст материала" wide><textarea name="body" rows={8} className={`${inputClass()} py-2`} /></Field>
      <Field label="Заметки" wide><textarea name="notes" rows={3} className={`${inputClass()} py-2`} /></Field>
      <input type="hidden" name="utmContent" value="" />
      <input type="hidden" name="lastIndexCheckAt" value="" />
      <div className="flex justify-end gap-2 md:col-span-3">
        <button type="button" className="soft-admin-action" onClick={onDone}>Отмена</button>
        <button type="submit" disabled={pending} className="soft-admin-action" data-variant="primary">{pending ? "Добавляю…" : "Добавить в реестр"}</button>
      </div>
    </form>
  );
}

export function PublicationsManager({ registry }: { registry: ExternalPublicationRegistry }) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = registry.rows.find((row) => row.id === editingId) ?? null;

  const refresh = () => {
    setEditingId(null);
    setShowCreate(false);
    router.refresh();
  };

  const platformOptions = useMemo(() => Object.entries(platformLabels).map(([, label]) => ({
    value: label,
    label,
  })), []);
  const statusOptions = useMemo(() => Object.entries(statusLabels).map(([, label]) => ({
    value: label,
    label,
  })), []);
  const contentOptions = useMemo(() => Object.entries(contentLabels).map(([, label]) => ({
    value: label,
    label,
  })), []);
  const columns: AdminCompactColumn[] = useMemo(() => [
    { key: "plannedAt", label: "Плановая дата", sortable: true, filterKind: "date" },
    { key: "material", label: "Материал", sortable: true, filterKind: "text" },
    { key: "platform", label: "Площадка", sortable: true, filterKind: "select", options: platformOptions },
    { key: "kind", label: "Тип", sortable: true, filterKind: "select", options: contentOptions },
    { key: "status", label: "Статус", sortable: true, filterKind: "select", options: statusOptions },
    // B626: «Архив» и «Ошибка» без причины — не отчёт, а загадка.
    { key: "reason", label: "Причина", sortable: true, filterKind: "text" },
    { key: "query", label: "Запрос / UTM", sortable: true, filterKind: "text" },
    { key: "text", label: "Текст", sortable: false, filterKind: "text" },
    { key: "metrics", label: "Внешние метрики", sortable: true, filterKind: "none", align: "right" },
    { key: "touches", label: "UTM", sortable: true, filterKind: "none", align: "right" },
    { key: "control", label: "Контроль", sortable: true, filterKind: "text" },
    { key: "actions", label: "Действия", sortable: false, filterKind: "none" },
  ], [contentOptions, platformOptions, statusOptions]);

  const rows: AdminCompactRow[] = useMemo(() => registry.rows.map((row) => {
    const status = statusLabels[row.status] ?? row.status;
    // Причина архивации и причина отказа — разные вопросы. Архив отвечает
    // «почему строки больше нет в плане», ошибка — «на чём упала последняя
    // попытка»; смешивать их в одну колонку значит потерять первый ответ.
    const reason = row.status === "ARCHIVED"
      ? archiveReasonLabel(row.archiveReason) ?? archiveReasonLabel(row.lastError) ?? "Причина не записана"
      : row.lastError ?? "—";
    const control = row.lastError
      ? `Ошибка: ${row.lastError}`
      : row.indexCheckDue
        ? "Проверить индекс"
        : row.reviewDue
          ? "Снять метрики"
          : "По плану";
    return {
      id: row.id,
      cells: {
        plannedAt: {
          value: formatDate(row.scheduledFor ?? row.publishedAt),
          sortValue: row.scheduledFor ?? row.publishedAt ?? "",
        },
        material: {
          value: row.title,
          subvalue: `${contentLabels[row.contentType] ?? row.contentType} · ${row.channelName ?? row.planSlot ?? "без канала"}`,
          sortValue: row.title,
          filterValue: `${row.title} ${row.key} ${row.cluster ?? ""}`,
        },
        platform: {
          value: platformLabels[row.platform.toUpperCase()] ?? row.platform,
          sortValue: row.platform,
        },
        kind: {
          value: contentLabels[row.contentType] ?? row.contentType,
          sortValue: row.contentType,
          filterValue: contentLabels[row.contentType] ?? row.contentType,
        },
        reason: {
          value: reason,
          subvalue: row.recoveryCount > 0 ? `возвратов в работу: ${row.recoveryCount}` : undefined,
          filterValue: reason,
          sortValue: reason,
        },
        status: {
          kind: "status" as const,
          label: status,
          tone: row.status === "FAILED"
            ? ("danger" as const)
            : row.status === "PUBLISHED"
              ? ("ok" as const)
              : row.status === "SCHEDULED"
                ? ("warn" as const)
                : ("neutral" as const),
          filterValue: status,
          sortValue: row.status,
        },
        query: {
          value: row.targetQuery ?? "—",
          subvalue: row.utmSource && row.utmCampaign
            ? `${row.utmSource} / ${row.utmCampaign}`
            : "UTM не задана",
          filterValue: `${row.targetQuery ?? ""} ${row.utmSource ?? ""} ${row.utmCampaign ?? ""}`,
        },
        text: {
          kind: "details" as const,
          label: "Показать",
          title: row.title,
          body: row.body ?? "Текст ещё не сгенерирован.",
          meta: `${platformLabels[row.platform.toUpperCase()] ?? row.platform} · план ${formatDate(row.scheduledFor)}`,
          filterValue: row.body ?? "",
        },
        metrics: {
          value: row.latestMetric?.views ?? 0,
          subvalue: `${row.latestMetric?.reactions ?? 0} реакций · ${row.latestMetric?.shares ?? 0} репостов`,
          sortValue: row.latestMetric?.views ?? 0,
        },
        touches: {
          value: row.touches,
          subvalue: `${row.conversions} конверсий`,
          sortValue: row.touches,
        },
        control: {
          kind: "status" as const,
          label: control,
          tone: row.lastError
            ? ("danger" as const)
            : row.indexCheckDue || row.reviewDue
              ? ("warn" as const)
              : ("ok" as const),
          filterValue: control,
          sortValue: control,
        },
        actions: {
          kind: "actions" as const,
          actions: [
            ...(row.publicUrl ? [{
              label: "Открыть публикацию",
              href: row.publicUrl,
              external: true,
              icon: "open" as const,
            }] : []),
            {
              label: "Контроль и метрики",
              onClick: () => setEditingId(row.id),
              icon: "edit" as const,
            },
          ],
        },
      },
    };
  }), [registry.rows]);

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-[var(--soft-ink-soft)]">
          В таблице видны и будущие слоты контент-плана, и опубликованные материалы.
        </p>
        <button type="button" className="soft-admin-action" onClick={() => router.refresh()}><RefreshCw className="size-4" /> Обновить</button>
        <button type="button" className="soft-admin-action" data-variant="primary" onClick={() => setShowCreate((value) => !value)}><Plus className="size-4" /> Добавить</button>
      </div>

      {showCreate ? <CreatePanel onDone={refresh} /> : null}

      <AdminCompactDataTable
        columns={columns}
        rows={rows}
        pageSize={25}
        minWidth="1820px"
        empty="В реестре пока нет материалов"
      />

      {editing && typeof document !== "undefined" ? createPortal(
        <div
          className="fixed inset-0 z-[200] grid place-items-center bg-black/35 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Контроль: ${editing.title}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) setEditingId(null);
          }}
        >
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-5xl overflow-auto rounded-xl border border-[var(--soft-paper-edge)] bg-white shadow-2xl">
            <div className="border-b border-[var(--soft-paper-edge)] px-4 py-3">
              <h3 className="font-heading text-lg font-semibold text-[var(--soft-bordeaux)]">{editing.title}</h3>
              <p className="text-xs text-[var(--soft-ink-soft)]">Контроль публикации и новый срез метрик</p>
            </div>
            <UpdatePanel row={editing} onDone={refresh} />
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
