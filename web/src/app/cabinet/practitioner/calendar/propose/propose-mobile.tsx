"use client";

import { useState } from "react";
import { Bell, Calendar, ChevronLeft, ChevronRight, Loader2, Plus, Send, X } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { appUrl } from "@/lib/subdomain";
import { offeredFormatOptions } from "@/lib/session-formats";

// B466 R9-4 P3 — мобильный «Записать клиента» 1-в-1 по mockup
// practitioner-calendar-propose.html: клиент (шторка выбора) · формат ·
// дата/время (нативный пикер) · длительность+цена · комментарий · итог ·
// отправить. Тот же эндпоинт, что и десктоп: POST /api/practitioner/proposals.
// B480 (2026-07-10): форматы сессий реальны — сегмент показывает форматы,
// которые практик предлагает (individual/couple/family), выбор уходит в бронь.

interface Client {
  id: string;
  label: string;
}
interface Rate {
  durationMin: number;
  priceRub: number;
}

function initialsOf(label: string): string {
  return (
    label
      .split(" ")
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function ProposeMobile({
  clients,
  rates,
  formats,
  preselectedClientId,
}: {
  clients: Client[];
  rates: Rate[];
  formats: string[];
  preselectedClientId: string | null;
}) {
  const formatOptions = offeredFormatOptions(formats);
  const [clientId, setClientId] = useState(
    preselectedClientId && clients.some((c) => c.id === preselectedClientId)
      ? preselectedClientId
      : clients[0]?.id ?? "",
  );
  const [when, setWhen] = useState("");
  const [durationMin, setDurationMin] = useState(rates[0]?.durationMin ?? 50);
  const [format, setFormat] = useState(formatOptions[0]?.id ?? "individual");
  const [message, setMessage] = useState("");
  const [commentOpen, setCommentOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const client = clients.find((c) => c.id === clientId) ?? clients[0];
  const price = rates.find((r) => r.durationMin === durationMin)?.priceRub ?? 0;

  async function submit() {
    const startAt = new Date(when);
    if (!when || Number.isNaN(startAt.getTime()) || startAt.getTime() <= Date.now()) {
      toast.error("Выберите время в будущем");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/practitioner/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, startAt: startAt.toISOString(), durationMin, format, message: message.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Не удалось отправить предложение");
      toast.success("Предложение отправлено клиенту");
      window.location.href = "/cabinet/practitioner/calendar";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отправить предложение");
      setBusy(false);
    }
  }

  return (
    <div className="pcab-screen md:hidden" data-pcab-top data-testid="practitioner-propose-mobile">
      <div className="pcab-topbar">
        <Link href={appUrl("/practitioner/calendar")} className="pcab-roundbtn" aria-label="Назад">
          <ChevronLeft width={19} height={19} aria-hidden="true" />
        </Link>
        <span className="pcab-topbar-title">Записать клиента</span>
        <span className="pcab-topbar-spacer" />
      </div>

      <p className="pcab-lead">
        Предложите клиенту время. Он получит уведомление, подтвердит и оплатит — тогда сессия попадёт в расписание.
      </p>

      {/* Клиент */}
      <div className="pcab-flabel">Клиент</div>
      <div className="pcab-cpick" data-testid="propose-client">
        <div className="pcab-cpick-av" aria-hidden="true">{initialsOf(client?.label ?? "?")}</div>
        <div className="pcab-cpick-main">
          <div className="pcab-cpick-name">{client?.label ?? "Клиент"}</div>
          <div className="pcab-cpick-meta">ваш клиент</div>
        </div>
        {clients.length > 1 && (
          <button type="button" className="pcab-cpick-change" onClick={() => setPickerOpen(true)}>
            Изменить
          </button>
        )}
      </div>

      {/* Формат — форматы, которые практик предлагает (B480) */}
      <div className="pcab-flabel">Формат</div>
      <div
        className="pcab-seg2"
        style={{ gridTemplateColumns: `repeat(${formatOptions.length}, 1fr)` }}
        data-testid="propose-formats"
      >
        {formatOptions.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`pcab-seg-item${format === f.id ? " is-active" : ""}`}
            onClick={() => setFormat(f.id)}
            aria-pressed={format === f.id}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Дата и время */}
      <div className="pcab-flabel">Дата и время</div>
      <label className="pcab-fieldinput" data-testid="propose-when">
        <span className="ic" aria-hidden="true">
          <Calendar width={18} height={18} strokeWidth={1.7} />
        </span>
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          aria-label="Дата и время сессии (МСК)"
          required
        />
        <span className="chev" aria-hidden="true">
          <ChevronRight width={18} height={18} />
        </span>
      </label>

      {/* Длительность и цена */}
      <div className="pcab-flabel">Длительность</div>
      <div className="pcab-dur3" data-testid="propose-durations">
        {rates.map((rate) => (
          <button
            key={rate.durationMin}
            type="button"
            className={`pcab-dur${rate.durationMin === durationMin ? " active" : ""}`}
            onClick={() => setDurationMin(rate.durationMin)}
          >
            {rate.durationMin} мин<small>{rate.priceRub.toLocaleString("ru")} ₽</small>
          </button>
        ))}
      </div>

      {/* Комментарий клиенту — необязательный, свёрнут по умолчанию (owner 07-10) */}
      {!commentOpen ? (
        <button
          type="button"
          className="pcab-addcomment"
          onClick={() => setCommentOpen(true)}
          data-testid="propose-comment-toggle"
        >
          <Plus width={15} height={15} strokeWidth={2} aria-hidden="true" />
          Добавить комментарий клиенту
        </button>
      ) : (
        <>
          <div className="pcab-flabel">
            Комментарий клиенту <span className="opt">(необязательно)</span>
          </div>
          <textarea
            className="pcab-commentarea"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Например: продолжим работу с темой прошлой сессии"
            rows={3}
            maxLength={500}
            data-testid="propose-comment"
            autoFocus
          />
        </>
      )}

      <div className="pcab-total">
        <span className="pcab-total-k">Клиент оплатит</span>
        <span className="pcab-total-v" data-testid="propose-total">{price.toLocaleString("ru")} ₽</span>
      </div>

      <button
        type="button"
        className="pcab-btn block pcab-btn-primary"
        style={{ marginTop: 14 }}
        onClick={submit}
        disabled={busy || !clientId}
        data-testid="propose-submit"
      >
        {busy ? <Loader2 width={16} height={16} className="animate-spin" aria-hidden="true" /> : <Send width={16} height={16} strokeWidth={2} aria-hidden="true" />}
        Отправить предложение
      </button>
      <div className="pcab-sendnote">
        <Bell width={15} height={15} strokeWidth={1.9} aria-hidden="true" />
        Клиенту придёт уведомление с предложением. Сессия появится в расписании после его подтверждения и оплаты.
      </div>

      {/* Шторка выбора клиента */}
      {pickerOpen && (
        <div className="pcab-sheet-wrap" data-testid="propose-client-picker">
          <button type="button" className="pcab-sheet-scrim" aria-label="Закрыть" onClick={() => setPickerOpen(false)} />
          <div className="pcab-sheet" role="dialog" aria-modal="true" aria-label="Выбор клиента">
            <div className="pcab-grabber" aria-hidden="true" />
            <div className="pcab-sheet-head">
              <span className="pcab-sheet-title">Клиент</span>
              <button type="button" className="pcab-sheet-x" aria-label="Закрыть" onClick={() => setPickerOpen(false)}>
                <X width={15} height={15} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
            <div className="pcab-sheet-sub">Записать можно клиента, с которым уже была сессия.</div>
            <div className="pcab-elist">
              {clients.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="pcab-cpick"
                  style={{ textAlign: "left" }}
                  onClick={() => {
                    setClientId(c.id);
                    setPickerOpen(false);
                  }}
                >
                  <div className="pcab-cpick-av" aria-hidden="true">{initialsOf(c.label)}</div>
                  <div className="pcab-cpick-main">
                    <div className="pcab-cpick-name">{c.label}</div>
                  </div>
                  {c.id === clientId && <span className="pcab-cpick-change">Выбран</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
