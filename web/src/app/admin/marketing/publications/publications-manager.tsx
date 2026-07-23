"use client";

import { Fragment, useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import type { ExternalPublicationRegistry } from "@/lib/external-publications";
import {
  PUBLICATION_CONTENT_TYPES,
  PUBLICATION_INDEX_STATUSES,
  PUBLICATION_PLATFORMS,
  PUBLICATION_STATUSES,
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
  YOUTUBE: "YouTube",
  MEDIA: "СМИ",
  DIRECTORY: "Каталог",
  OTHER: "Другое",
};

const statusLabels: Record<string, string> = {
  PLANNED: "Запланировано",
  DRAFT: "Черновик",
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
  VIDEO: "Видео",
  PROFILE: "Профиль",
  DIRECTORY_CARD: "Карточка каталога",
  OTHER: "Другое",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(value));
}

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function inputClass() {
  return "min-h-10 w-full rounded-lg border border-[#D6DEE9] bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100";
}

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? "md:col-span-2" : ""}>
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function ActionFlag({ row }: { row: RegistryRow }) {
  if (!row.reviewDue && !row.indexCheckDue) return <span className="text-xs text-emerald-700">По плану</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {row.indexCheckDue ? <span className="rounded-full bg-amber-50 px-2 py-1 text-[0.68rem] font-semibold text-amber-800">Проверить индекс</span> : null}
      {row.reviewDue ? <span className="rounded-full bg-blue-50 px-2 py-1 text-[0.68rem] font-semibold text-blue-800">Снять метрики</span> : null}
    </div>
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
      <Field label="Публичная ссылка" wide>
        <input name="publicUrl" type="url" defaultValue={row.publicUrl ?? ""} className={inputClass()} />
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
      <Field label="utm_source"><input name="utmSource" placeholder="vk" className={inputClass()} /></Field>
      <Field label="utm_medium"><input name="utmMedium" placeholder="organic" className={inputClass()} /></Field>
      <Field label="utm_campaign"><input name="utmCampaign" placeholder="relationship_silence" className={inputClass()} /></Field>
      <Field label="Целевой запрос"><input name="targetQuery" placeholder="почему он перестал писать" className={inputClass()} /></Field>
      <Field label="Контент-кластер"><input name="cluster" placeholder="Отношения" className={inputClass()} /></Field>
      <Field label="Опубликовано"><input name="publishedAt" type="datetime-local" className={inputClass()} /></Field>
      <Field label="Следующий контроль"><input name="nextReviewAt" type="datetime-local" className={inputClass()} /></Field>
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
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("ALL");
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const rows = useMemo(() => registry.rows.filter((row) => {
    const haystack = `${row.title} ${row.channelName ?? ""} ${row.targetQuery ?? ""} ${row.utmCampaign ?? ""}`.toLocaleLowerCase("ru-RU");
    return (platform === "ALL" || row.platform === platform) && (!query || haystack.includes(query.toLocaleLowerCase("ru-RU")));
  }), [platform, query, registry.rows]);

  const refresh = () => {
    setEditingId(null);
    setShowCreate(false);
    router.refresh();
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[250px] flex-1">
          <span className="sr-only">Поиск по публикациям</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Материал, запрос или UTM-кампания" className={`${inputClass()} pl-9`} />
        </label>
        <label>
          <span className="sr-only">Площадка</span>
          <select value={platform} onChange={(event) => setPlatform(event.target.value)} className={inputClass()}>
            <option value="ALL">Все площадки</option>
            {PUBLICATION_PLATFORMS.map((value) => <option key={value} value={value}>{platformLabels[value]}</option>)}
          </select>
        </label>
        <button type="button" className="soft-admin-action" onClick={() => router.refresh()}><RefreshCw className="size-4" /> Обновить</button>
        <button type="button" className="soft-admin-action" data-variant="primary" onClick={() => setShowCreate((value) => !value)}><Plus className="size-4" /> Добавить</button>
      </div>

      {showCreate ? <CreatePanel onDone={refresh} /> : null}

      <div className="overflow-x-auto rounded-lg border border-[#D6DEE9]">
        <table className="w-full min-w-[1120px] text-left text-sm">
          <thead className="bg-slate-50 text-[0.68rem] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5">Материал</th>
              <th className="px-3 py-2.5">Статус</th>
              <th className="px-3 py-2.5">Запрос / UTM</th>
              <th className="px-3 py-2.5 text-right">Внешние метрики</th>
              <th className="px-3 py-2.5 text-right">UTM-касания</th>
              <th className="px-3 py-2.5">Контроль</th>
              <th className="px-3 py-2.5"><span className="sr-only">Действия</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr className="align-top hover:bg-slate-50/70">
                  <td className="max-w-md px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.65rem] font-bold text-slate-600">{platformLabels[row.platform] ?? row.platform}</span>
                      <span className="text-[0.68rem] text-slate-500">{contentLabels[row.contentType] ?? row.contentType}</span>
                    </div>
                    <p className="mt-1 font-semibold text-slate-900">{row.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{row.channelName ?? "—"} · {formatDate(row.publishedAt)}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-slate-800">{statusLabels[row.status] ?? row.status}</p>
                    <p className="mt-1 text-xs text-slate-500">{indexLabels[row.indexStatus] ?? row.indexStatus}</p>
                  </td>
                  <td className="max-w-xs px-3 py-3">
                    <p className="font-medium text-slate-800">{row.targetQuery ?? "—"}</p>
                    <p className="mt-1 break-all text-xs text-slate-500">{row.utmSource && row.utmCampaign ? `${row.utmSource} / ${row.utmCampaign}` : "UTM не задана"}</p>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <p className="font-semibold text-slate-900">{(row.latestMetric?.views ?? 0).toLocaleString("ru-RU")} просмотров</p>
                    <p className="mt-1 text-xs text-slate-500">{(row.latestMetric?.reactions ?? 0).toLocaleString("ru-RU")} реакций · {(row.latestMetric?.shares ?? 0).toLocaleString("ru-RU")} репостов</p>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <p className="font-semibold text-slate-900">{row.touches.toLocaleString("ru-RU")}</p>
                    <p className="mt-1 text-xs text-slate-500">{row.conversions.toLocaleString("ru-RU")} конверсий</p>
                  </td>
                  <td className="px-3 py-3"><ActionFlag row={row} /></td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-1">
                      {row.publicUrl ? <Link href={row.publicUrl} target="_blank" rel="noreferrer" className="soft-admin-icon-button" aria-label="Открыть публикацию"><ExternalLink className="size-4" /></Link> : null}
                      <button type="button" className="soft-admin-action" onClick={() => setEditingId(editingId === row.id ? null : row.id)}>Контроль</button>
                    </div>
                  </td>
                </tr>
                {editingId === row.id ? (
                  <tr><td colSpan={7} className="p-0"><UpdatePanel row={row} onDone={refresh} /></td></tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <div className="bg-white px-4 py-10 text-center text-sm text-slate-500">По фильтру ничего не найдено</div> : null}
      </div>
    </div>
  );
}
