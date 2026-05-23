"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowRight, Download, EyeOff, FileImage, LockKeyhole, Save, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";

type ToneEntry = { label: string; pct: number };
type ReplyVariant = { style: string; text: string };

type ChatAnalysisStructured = {
  insight: string;
  tonesThem: ToneEntry[];
  tonesMe: ToneEntry[];
  replies: ReplyVariant[];
  safetyNote: string;
};

function tryParseChatAnalysis(text: string): ChatAnalysisStructured | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as Partial<ChatAnalysisStructured>;
    if (!raw.insight || !Array.isArray(raw.replies)) return null;
    return raw as ChatAnalysisStructured;
  } catch {
    return null;
  }
}

type ChatAnalysisResult = {
  id: string;
  status: string;
  title: string;
  previewText: string | null;
  resultText: string | null;
  saved: boolean;
  metadata?: {
    sourceText?: string | null;
    sourceDeletedAt?: string | null;
    sourceKind?: string | null;
    recognizedText?: string | null;
    piiMasked?: boolean | null;
    screenshotStored?: boolean | null;
  };
};

type ApiPayload = {
  hasEntitlement?: boolean;
  result?: ChatAnalysisResult;
  results?: ChatAnalysisResult[];
  error?: string;
};

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error((payload as ApiPayload).error ?? "Не удалось выполнить действие");
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return payload as T;
}

const CONTACTS = ["партнёр", "бывший(ая)", "родитель", "друг", "коллега", "начальник", "другой"];
const EMOTIONS = ["растерянность", "злость", "вина", "грусть", "страх", "пустота", "стыд"];

function ToneBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[13.5px] font-medium text-[var(--soft-ink)]">{label}</span>
        <span className="text-xs text-[var(--soft-ink-faint)]">{pct}%</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--soft-paper-edge)]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function StructuredResult({ data, result, onSave, onDelete, onDeleteSource, loading }: {
  data: ChatAnalysisStructured;
  result: ChatAnalysisResult;
  onSave: () => void;
  onDelete: () => void;
  onDeleteSource: () => void;
  loading: boolean;
}) {
  return (
    <div className="mt-4 flex flex-col gap-4">
      {/* main insight */}
      <div className="rounded-[20px] p-6" style={{ background: "linear-gradient(160deg, #FFFCF5, #F4D9C1)" }}>
        <p className="soft-eyebrow">главное</p>
        <p className="mt-3 font-heading text-[1.6rem] italic leading-snug text-[var(--soft-bordeaux)]">
          {data.insight}
        </p>
      </div>

      {/* tone bars */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="soft-card p-5">
          <p className="soft-eyebrow mb-4">тон собеседника</p>
          <div className="flex flex-col gap-3">
            {data.tonesThem.map((t) => (
              <ToneBar key={t.label} label={t.label} pct={t.pct} color="var(--soft-terracotta-dark)" />
            ))}
          </div>
        </div>
        <div className="soft-card p-5">
          <p className="soft-eyebrow mb-4">ваш тон</p>
          <div className="flex flex-col gap-3">
            {data.tonesMe.map((t) => (
              <ToneBar key={t.label} label={t.label} pct={t.pct} color="var(--soft-bordeaux)" />
            ))}
          </div>
        </div>
      </div>

      {/* reply variants */}
      <div className="soft-card p-5">
        <p className="soft-eyebrow mb-4">три варианта ответа</p>
        <div className="flex flex-col gap-3">
          {data.replies.map((r, i) => (
            <div key={i} className="soft-card-flat p-4">
              <span className="soft-badge soft-badge-warm" style={{ fontSize: 11 }}>{r.style}</span>
              <p className="mt-2 font-heading text-[1.06rem] italic leading-relaxed text-[var(--soft-ink)]">
                {r.text}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* safety card */}
      <div className="rounded-[20px] p-5" style={{ background: "var(--soft-bordeaux)", color: "#F4D9C1" }}>
        <p className="text-xs font-semibold uppercase tracking-widest opacity-70">важно</p>
        <p className="mt-2 font-heading text-lg italic leading-relaxed" style={{ color: "#FBF0E1" }}>
          {data.safetyNote}
        </p>
      </div>

      {/* action buttons */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={onSave} disabled={loading || result.saved} className="soft-button soft-button-ghost">
          <Save className="size-4" aria-hidden="true" />
          {result.saved ? "Сохранено" : "Сохранить в Мою карту"}
        </Button>
        <a href={`/api/products/chat-analysis/${result.id}/export`} className="soft-button soft-button-ghost">
          <Download className="size-4" aria-hidden="true" />
          Экспорт
        </a>
        {result.metadata?.sourceText && !result.metadata?.sourceDeletedAt && (
          <Button onClick={onDeleteSource} disabled={loading} className="soft-button soft-button-ghost text-[var(--soft-terracotta-dark)]">
            <EyeOff className="size-4" aria-hidden="true" />
            Удалить исходник
          </Button>
        )}
        <Button onClick={onDelete} disabled={loading} className="soft-button soft-button-ghost">
          <Trash2 className="size-4" aria-hidden="true" />
          Удалить разбор
        </Button>
      </div>
    </div>
  );
}

export function ChatAnalysisActions() {
  const { status: authStatus } = useSession();
  const [result, setResult] = useState<ChatAnalysisResult | null>(null);
  const [hasEntitlement, setHasEntitlement] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "paying" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const [tab, setTab] = useState<"input" | "context" | "result">("input");
  const [sourceText, setSourceText] = useState("");
  const [screenshotName, setScreenshotName] = useState<string | null>(null);
  const [contact, setContact] = useState<string | null>(null);
  const [emotion, setEmotion] = useState<string | null>(null);
  const [goal, setGoal] = useState("");

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;
    jsonRequest<ApiPayload>("/api/products/chat-analysis")
      .then((payload) => {
        if (cancelled) return;
        setHasEntitlement(Boolean(payload.hasEntitlement));
        const existing = payload.results?.[0] ?? null;
        setResult(existing);
        if (existing?.resultText) setTab("result");
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [authStatus]);

  async function uploadScreenshot(file: File | null) {
    if (!file) return;
    setStatus("loading");
    setMessage(null);
    setScreenshotName(file.name);
    try {
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
        reader.readAsDataURL(file);
      });
      const payload = await jsonRequest<ApiPayload>("/api/products/chat-analysis", {
        method: "POST",
        body: JSON.stringify({ action: "screenshot_preview", imageDataUrl, fileName: file.name }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setResult(payload.result ?? null);
      setSourceText("");
      setStatus("idle");
      setTab("context");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось распознать скриншот");
      setStatus("error");
    }
  }

  async function proceedToContext() {
    if (!sourceText.trim()) return;
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>("/api/products/chat-analysis", {
        method: "POST",
        body: JSON.stringify({ sourceText: sourceText.trim(), action: "upload_preview" }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setResult(payload.result ?? null);
      setStatus("idle");
      setTab("context");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить переписку");
      setStatus("error");
    }
  }

  async function generateReport() {
    if (!result?.id) return;
    setStatus("loading");
    setMessage(null);
    try {
      const contextNote = [
        contact ? `Кто собеседник: ${contact}` : "",
        emotion ? `Мои чувства: ${emotion}` : "",
        goal ? `Чего хочу от разбора: ${goal}` : "",
      ].filter(Boolean).join("\n");

      const payload = await jsonRequest<ApiPayload>("/api/products/chat-analysis", {
        method: "POST",
        body: JSON.stringify({
          id: result.id,
          action: "generate",
          contextNote: contextNote || undefined,
        }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setResult(payload.result ?? null);
      setStatus("idle");
      setTab("result");
    } catch (error) {
      const typed = error as Error & { status?: number };
      if (typed.status === 402) {
        setMessage("Откройте доступ к разбору переписки с баланса, кредитами ясности или картой — распознанный текст останется здесь.");
        setStatus("error");
        return;
      }
      setMessage(typed.message || "Не удалось получить разбор");
      setStatus("error");
    }
  }

  async function saveReport() {
    if (!result) return;
    setStatus("loading");
    try {
      const payload = await jsonRequest<ApiPayload>(`/api/products/chat-analysis/${result.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "save" }),
      });
      setResult(payload.result ?? result);
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить результат");
      setStatus("error");
    }
  }

  async function deleteSource() {
    if (!result) return;
    setStatus("loading");
    try {
      const payload = await jsonRequest<ApiPayload>(`/api/products/chat-analysis/${result.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "delete_source" }),
      });
      setResult(payload.result ?? result);
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось удалить исходник");
      setStatus("error");
    }
  }

  async function deleteReport() {
    if (!result) return;
    setStatus("loading");
    try {
      await jsonRequest(`/api/products/chat-analysis/${result.id}`, { method: "DELETE" });
      setResult(null);
      setSourceText("");
      setTab("input");
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось удалить результат");
      setStatus("error");
    }
  }

  const parsed: ChatAnalysisStructured | null = result?.resultText
    ? tryParseChatAnalysis(result.resultText)
    : null;

  return (
    <div className="soft-card soft-form-panel mt-8" data-testid="chat-analysis-actions">
      {/* tab nav */}
      <div className="flex flex-wrap gap-2">
        {(["input", "context", "result"] as const).map((t, i) => (
          <button
            key={t}
            type="button"
            onClick={() => { if (t === "context" && !result) return; if (t === "result" && !result?.resultText) return; setTab(t); }}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              tab === t
                ? "border-[var(--soft-bordeaux)] bg-[var(--soft-bordeaux)] text-[#FBF0E1]"
                : "border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)] hover:border-[var(--soft-bordeaux)]"
            } ${t === "context" && !result ? "opacity-40 cursor-not-allowed" : ""} ${t === "result" && !result?.resultText ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            {i + 1}. {t === "input" ? "Вставить переписку" : t === "context" ? "Контекст" : "Разбор"}
          </button>
        ))}
      </div>

      {message && (
        <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">
          {message}
        </p>
      )}

      {/* tab 1: input */}
      {tab === "input" && (
        <div className="soft-card mt-4 p-5">
          <p className="soft-eyebrow mb-3">переписка</p>
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder={"— Ты опять не отвечаешь.\n— Я был занят, говорил же.\n— Каждый раз «занят». Я для тебя на втором месте?\n— Ну вот, опять начинается."}
            className="soft-question-input"
            rows={8}
            disabled={status === "loading"}
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <label className="soft-button soft-button-ghost inline-flex cursor-pointer items-center">
              <FileImage className="size-4" aria-hidden="true" />
              {status === "loading" && screenshotName ? "Распознаем..." : "Загрузить скриншот"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                disabled={status === "loading"}
                onChange={(e) => {
                  void uploadScreenshot(e.target.files?.[0] ?? null);
                  e.currentTarget.value = "";
                }}
              />
            </label>
          </div>
          {screenshotName && (
            <p className="mt-2 text-xs text-[var(--soft-ink-soft)]">
              <Upload className="mr-1 inline size-3" aria-hidden="true" />
              {screenshotName}
            </p>
          )}
          <p className="mt-4 text-xs text-[var(--soft-ink-faint)]">
            🔒 Имена автоматически заменяются. Переписка не хранится дольше 30 дней.
          </p>
          <Button
            onClick={proceedToContext}
            disabled={status === "loading" || sourceText.trim().length < 10}
            className="soft-button soft-button-primary mt-5"
          >
            Дальше: контекст
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      )}

      {/* tab 2: context */}
      {tab === "context" && (
        <div className="soft-card mt-4 p-5">
          {result?.metadata?.sourceKind === "screenshot" && result.metadata?.recognizedText && (
        <div className="soft-card-flat mb-4 max-h-40 overflow-y-auto p-4 text-sm leading-relaxed text-[var(--soft-ink)]">
          <p className="soft-eyebrow mb-2 text-[var(--soft-bordeaux)]">Распознанный текст</p>
          <p className="whitespace-pre-wrap">{result.metadata.recognizedText}</p>
        </div>
      )}
      <p className="soft-eyebrow mb-4">короткий контекст</p>
          <div className="flex flex-col gap-5">
            <div>
              <label className="text-[13px] text-[var(--soft-ink-soft)]">Кто собеседник?</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {CONTACTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setContact(contact === c ? null : c)}
                    className={`rounded-full border px-3 py-1 text-sm transition ${
                      contact === c
                        ? "border-[var(--soft-bordeaux)] bg-[var(--soft-bordeaux)] text-[#FBF0E1]"
                        : "border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)] hover:border-[var(--soft-bordeaux)]"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[13px] text-[var(--soft-ink-soft)]">Что вы сейчас чувствуете?</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {EMOTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEmotion(emotion === e ? null : e)}
                    className={`rounded-full border px-3 py-1 text-sm transition ${
                      emotion === e
                        ? "border-[var(--soft-bordeaux)] bg-[var(--soft-bordeaux)] text-[#FBF0E1]"
                        : "border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)] hover:border-[var(--soft-bordeaux)]"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[13px] text-[var(--soft-ink-soft)]">Что хочется получить от разбора?</label>
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Понять, почему меня это так задевает. И как ответить, чтобы не было хуже."
                className="soft-question-input mt-2"
                rows={3}
              />
            </div>
          </div>

          <Button
            onClick={generateReport}
            disabled={!hasEntitlement || status === "loading" || status === "paying"}
            className="soft-button soft-button-primary mt-6"
          >
            <LockKeyhole className="size-4" aria-hidden="true" />
            Получить разбор
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
          {!hasEntitlement && (
            <div className="mt-3">
              <ProductPurchaseControls
                productKey="chat-analysis"
                label="Открыть с баланса"
                checkoutSource="chat-analysis-generate"
                creditCost={2}
                onUnlocked={() => {
                  setHasEntitlement(true);
                  void generateReport();
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* tab 3: result */}
      {tab === "result" && result && (
        <>
          {parsed ? (
            <StructuredResult
              data={parsed}
              result={result}
              onSave={saveReport}
              onDelete={deleteReport}
              onDeleteSource={deleteSource}
              loading={status === "loading"}
            />
          ) : (
            <article className="soft-card mt-4 whitespace-pre-wrap p-5 font-heading text-[1.08rem] leading-relaxed text-[var(--soft-ink)]">
              {result.resultText}
            </article>
          )}
        </>
      )}
    </div>
  );
}
