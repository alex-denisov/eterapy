"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowRight, ClipboardPaste, Download, EyeOff, FileText, ImageIcon, LockKeyhole, Save, Trash2, Upload } from "lucide-react";
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

function StructuredResult({ data, result, onSave, onDelete, onDeleteSource, onStartNew, loading }: {
  data: ChatAnalysisStructured;
  result: ChatAnalysisResult;
  onSave: () => void;
  onDelete: () => void;
  onDeleteSource: () => void;
  onStartNew: () => void;
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

      {/* action buttons. B320: when result.saved (auto-saved on generate for
          authenticated users), label flips to "Сохранено в кабинете" — the
          phrasing the user expected and that matches the cabinet location. */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={onSave} disabled={loading || result.saved} className="soft-button soft-button-ghost" data-testid="chat-analysis-save">
          <Save className="size-4" aria-hidden="true" />
          {result.saved ? "Сохранено в кабинете" : loading ? "Сохраняем…" : "Сохранить разбор"}
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
        {/* B330: explicit "start over" entry. Resets the form to the input
            tab without touching the saved result in My Map, so the user can
            queue up a second analysis right after the first. */}
        <Button
          onClick={onStartNew}
          disabled={loading}
          className="soft-button soft-button-primary"
          data-testid="chat-analysis-start-new"
        >
          <ArrowRight className="size-4" aria-hidden="true" />
          Начать новый разбор
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
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  // B330: removed the "Я подтверждаю, что переписка — моя" checkbox. A chat
  // is by definition between two people, so the original copy was misleading.
  // Privacy is now conveyed via a soft inline notice + the delete-source
  // affordance after generation.
  const [contact, setContact] = useState<string | null>(null);
  const [emotion, setEmotion] = useState<string | null>(null);
  const [goal, setGoal] = useState("");
  const screenshotInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;
    jsonRequest<ApiPayload>("/api/products/chat-analysis")
      .then((payload) => {
        if (cancelled) return;
        setHasEntitlement(Boolean(payload.hasEntitlement));
        const existing = payload.results?.[0] ?? null;
        // B330: do NOT auto-restore an already-saved analysis on mount.
        // A saved record lives in Мою карту; re-entering /products/chat-analysis
        // should start fresh so the user can buy and run another analysis.
        // We still surface an unsaved preview so an in-progress upload isn't
        // lost on refresh.
        if (existing && !existing.saved) {
          setResult(existing);
          if (existing.resultText) setTab("result");
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [authStatus]);

  function readAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
      reader.readAsDataURL(file);
    });
  }

  function readAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
      reader.readAsText(file);
    });
  }

  // Upload one or more screenshots. Each image is OCR'd server-side and the
  // recognized text is appended to the running sourceText so users can build
  // up a long conversation across multiple screenshots.
  async function uploadScreenshots(files: FileList | null) {
    if (!files || files.length === 0) return;
    setStatus("loading");
    setMessage(null);
    try {
      let combined = sourceText.trim();
      const newNames: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const imageDataUrl = await readAsDataURL(file);
        const payload = await jsonRequest<ApiPayload>("/api/products/chat-analysis", {
          method: "POST",
          body: JSON.stringify({ action: "screenshot_preview", imageDataUrl, fileName: file.name }),
        });
        setHasEntitlement(Boolean(payload.hasEntitlement));
        const recognized = payload.result?.metadata?.recognizedText ?? "";
        if (recognized) {
          combined = combined ? `${combined}\n\n${recognized}` : recognized;
        }
        newNames.push(`${file.name}${recognized ? "" : " (текст не распознан)"}`);
        // Keep the latest preview result so the user can see something even
        // before generating; downstream upload_preview will rebuild it.
        setResult(payload.result ?? null);
      }
      setSourceText(combined);
      setUploadedFiles((prev) => [...prev, ...newNames]);
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось распознать скриншот");
      setStatus("error");
    }
  }

  // Read a .txt or Telegram export file as plain text into the textarea.
  async function uploadTextFile(file: File | null) {
    if (!file) return;
    setStatus("loading");
    setMessage(null);
    try {
      const text = await readAsText(file);
      const combined = sourceText.trim() ? `${sourceText.trim()}\n\n${text}` : text;
      setSourceText(combined.slice(0, 10000));
      setUploadedFiles((prev) => [...prev, file.name]);
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось прочитать файл");
      setStatus("error");
    }
  }

  // Paste from clipboard — works for "Из Telegram" affordance. Browsers
  // require user gesture, which the chip click provides.
  async function pasteFromClipboard() {
    setMessage(null);
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setMessage("В буфере обмена нет текста — скопируйте переписку и нажмите ещё раз.");
        setStatus("error");
        return;
      }
      const combined = sourceText.trim() ? `${sourceText.trim()}\n\n${text}` : text;
      setSourceText(combined.slice(0, 10000));
    } catch {
      setMessage("Браузер не дал доступ к буферу обмена — скопируйте текст в поле руками.");
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
      setUploadedFiles([]);
      setContact(null);
      setEmotion(null);
      setGoal("");
      setTab("input");
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось удалить результат");
      setStatus("error");
    }
  }

  // B330: "Начать новый разбор" — clear local form state and go to input
  // tab. We deliberately do NOT delete the saved result from the cabinet;
  // it stays in My Map. The entitlement is also dropped from local state
  // so the next analysis triggers a fresh purchase / credit deduction.
  function startNewAnalysis() {
    setResult(null);
    setHasEntitlement(false);
    setSourceText("");
    setUploadedFiles([]);
    setContact(null);
    setEmotion(null);
    setGoal("");
    setMessage(null);
    setStatus("idle");
    setTab("input");
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

      {/* tab 1: input — v4.2 design: three affordances + soft privacy notice */}
      {tab === "input" && (
        <div className="soft-card mt-4 p-5" data-testid="chat-analysis-input">
          {/* B330: replaced the "Я подтверждаю что переписка — моя" checkbox
              with a soft inline privacy notice. The original copy was
              misleading (chats are by definition multi-party) and blocked
              the upload flow. */}
          <p className="soft-eyebrow mb-3">переписка</p>
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder={"Вставьте фрагмент диалога. Имена будут автоматически заменены на «Я» и «Собеседник». Файлы тоже подойдут — .txt, экспорт из Telegram, скриншоты."}
            className="soft-question-input"
            rows={8}
            disabled={status === "loading"}
            data-testid="chat-analysis-textarea"
          />

          {/* Three input affordances — v4.2 deepenings.jsx:26-30 */}
          <div className="mt-4 flex flex-wrap gap-2" data-testid="chat-analysis-upload-row">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={status === "loading"}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-3.5 py-1.5 text-[13px] text-[var(--soft-ink-soft)] transition hover:border-[var(--soft-bordeaux)] hover:text-[var(--soft-bordeaux)] disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="chat-analysis-upload-file"
            >
              <FileText className="size-4" aria-hidden="true" />
              Загрузить файл
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.html,.json,text/plain,text/html,application/json"
              className="sr-only"
              disabled={status === "loading"}
              onChange={(e) => {
                void uploadTextFile(e.target.files?.[0] ?? null);
                e.currentTarget.value = "";
              }}
            />

            <button
              type="button"
              onClick={() => screenshotInputRef.current?.click()}
              disabled={status === "loading"}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-3.5 py-1.5 text-[13px] text-[var(--soft-ink-soft)] transition hover:border-[var(--soft-bordeaux)] hover:text-[var(--soft-bordeaux)] disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="chat-analysis-upload-screenshot"
            >
              <ImageIcon className="size-4" aria-hidden="true" />
              {status === "loading" ? "Распознаём…" : "Скриншот"}
            </button>
            <input
              ref={screenshotInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="sr-only"
              disabled={status === "loading"}
              onChange={(e) => {
                void uploadScreenshots(e.target.files);
                e.currentTarget.value = "";
              }}
            />

            <button
              type="button"
              onClick={() => void pasteFromClipboard()}
              disabled={status === "loading"}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-3.5 py-1.5 text-[13px] text-[var(--soft-ink-soft)] transition hover:border-[var(--soft-bordeaux)] hover:text-[var(--soft-bordeaux)] disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="chat-analysis-upload-paste"
            >
              <ClipboardPaste className="size-4" aria-hidden="true" />
              Вставить из Telegram
            </button>
          </div>

          {uploadedFiles.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1" data-testid="chat-analysis-file-list">
              {uploadedFiles.map((name, i) => (
                <li key={`${name}-${i}`} className="flex items-center gap-2 text-xs text-[var(--soft-ink-soft)]">
                  <Upload className="size-3" aria-hidden="true" />
                  {name}
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 flex items-center gap-1.5 text-xs text-[var(--soft-ink-faint)]">
            <LockKeyhole className="size-3" aria-hidden="true" />
            Имена автоматически заменяются. Переписка не хранится дольше 30 дней.
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
              onStartNew={startNewAnalysis}
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
