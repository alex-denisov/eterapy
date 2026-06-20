"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, Compass, Download, LockKeyhole, Save, Share2, Sparkles, TreeDeciduous } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { SoftMarkdown } from "@/components/ui/soft-markdown";
import { useInputDraft } from "@/lib/use-input-draft";
import type { SurnameStory } from "@/lib/surname-story";
import { track } from "@/lib/analytics";
import { SHARE_EVENTS, withReferral } from "@/lib/share";

type SymbolicResult = {
  id: string;
  status: string;
  title: string;
  previewText: string | null;
  resultText: string | null;
  saved: boolean;
  metadata?: unknown;
};

type FreePayload = {
  ok?: boolean;
  needsSurname?: boolean;
  message?: string;
  story?: SurnameStory;
};

type ApiPayload = {
  hasEntitlement?: boolean;
  result?: SymbolicResult;
  results?: SymbolicResult[];
  paywalled?: boolean;
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

const PLACEHOLDER = "Например: Кузнецов, Ковальчук, Соколова. Достаточно одной фамилии.";

function storyFromResultMetadata(result: SymbolicResult | null): SurnameStory | null {
  const md = result?.metadata;
  if (!md || typeof md !== "object") return null;
  const meta = md as Record<string, unknown>;
  const nested = (meta.generationMetadata ?? meta.previewGenerationMetadata) as Record<string, unknown> | undefined;
  const raw = (nested?.surname ?? meta.surname) as unknown;
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { surname?: unknown; originKind?: unknown };
  if (typeof candidate.surname !== "string" || typeof candidate.originKind !== "string") return null;
  return raw as SurnameStory;
}

function StoryCard({ story }: { story: SurnameStory }) {
  return (
    <div className="rounded-[20px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-5" data-testid="surname-story-card">
      <p className="soft-eyebrow">история фамилии</p>
      <h3 className="mt-1 font-heading text-[1.7rem] italic leading-tight text-[var(--soft-bordeaux)]">{story.surname}</h3>
      <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">{story.originLabel}</p>
      <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink)]">{story.originStory}</p>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        {story.rootHint && (
          <div>
            <p className="soft-eyebrow text-[0.6rem]">связана с</p>
            <p className="mt-0.5 text-[var(--soft-ink)]">{story.rootHint}</p>
          </div>
        )}
        {story.regionHint && (
          <div>
            <p className="soft-eyebrow text-[0.6rem]">география формы</p>
            <p className="mt-0.5 text-[var(--soft-ink)]">{story.regionHint}</p>
          </div>
        )}
      </div>
      <div className="mt-4 rounded-[14px] bg-[var(--soft-paper-deep)] p-3">
        <p className="soft-eyebrow text-[0.6rem]">родовая тема</p>
        <p className="mt-1 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{story.familyTheme}.</p>
      </div>
    </div>
  );
}

export function SurnameStoryActions({ creditCost }: { creditCost: number }) {
  const { status: authStatus } = useSession();
  const [surname, setSurname] = useState("");
  const [story, setStory] = useState<SurnameStory | null>(null);
  const [freeStatus, setFreeStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const [hasEntitlement, setHasEntitlement] = useState(false);
  const [reading, setReading] = useState<SymbolicResult | null>(null);
  const [readingStatus, setReadingStatus] = useState<"idle" | "loading" | "error">("idle");

  // #3: фамилия сохраняется при переходе на /login и восстанавливается после.
  useInputDraft(
    "surname-story",
    { surname },
    (draft) => { if (typeof draft.surname === "string") setSurname(draft.surname); },
    { active: !reading },
  );

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;
    jsonRequest<ApiPayload>("/api/products/symbolic?productKey=surname-story")
      .then((payload) => {
        if (cancelled) return;
        setHasEntitlement(Boolean(payload.hasEntitlement));
        const last = payload.results?.[0] ?? null;
        setReading(last);
        const stored = storyFromResultMetadata(last);
        if (stored) setStory((current) => current ?? stored);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [authStatus]);

  async function computeFreeStory() {
    if (!surname.trim()) {
      setMessage("Напишите свою фамилию.");
      setFreeStatus("error");
      return;
    }
    setFreeStatus("loading");
    setMessage(null);
    setShareNote(null);
    try {
      const payload = await jsonRequest<FreePayload>("/api/products/surname-story", {
        method: "POST",
        body: JSON.stringify({ surname }),
      });
      if (!payload.ok || !payload.story) {
        setStory(null);
        setMessage(payload.message ?? "Не удалось разобрать фамилию. Проверьте написание.");
        setFreeStatus("idle");
        return;
      }
      setStory(payload.story);
      track({ event: "surname_story_computed", surface: "surname-story", properties: { kind: payload.story.originKind } });
      setFreeStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось разобрать фамилию");
      setFreeStatus("error");
    }
  }

  async function generateReading() {
    if (authStatus !== "authenticated") {
      setMessage("Войдите, чтобы открыть полный родовой разбор и сохранить его в Дневник.");
      return;
    }
    if (!surname.trim()) {
      setMessage("Сначала укажите фамилию и узнайте короткую историю.");
      return;
    }
    setReadingStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>("/api/products/symbolic", {
        method: "POST",
        body: JSON.stringify({ productKey: "surname-story", userInput: surname }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setReading(payload.result ?? null);
      const stored = storyFromResultMetadata(payload.result ?? null);
      if (stored) setStory(stored);
      if (payload.paywalled) {
        setMessage("Бесплатный фрагмент родового разбора готов. Полный разбор откроется баллами или картой здесь же.");
      }
      setReadingStatus("idle");
    } catch (error) {
      const typed = error as Error & { status?: number };
      setMessage(typed.status === 402
        ? "Откройте полный родовой разбор баллами или картой — он появится здесь же."
        : typed.message || "Не удалось собрать разбор");
      setReadingStatus("error");
    }
  }

  async function saveReading() {
    if (!reading) return;
    setReadingStatus("loading");
    try {
      const payload = await jsonRequest<ApiPayload>(`/api/products/symbolic/${reading.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "save" }),
      });
      setReading(payload.result ?? reading);
      setReadingStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить");
      setReadingStatus("error");
    }
  }

  async function shareStory() {
    if (!story) return;
    track({ event: SHARE_EVENTS.generated, surface: "surname-story", properties: { kind: "surname-story", origin: story.originKind } });
    const base = typeof window !== "undefined" ? `${window.location.origin}/products/surname-story` : "";
    const url = withReferral(base, "surname-story");
    const text = `${story.shareLine} ${story.originStory} Узнать историю своей фамилии:`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "История моей фамилии", text, url });
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setShareNote("Скопировано — можно вставить в чат или сторис.");
      }
    } catch {
      setShareNote(null);
    }
  }

  return (
    <div className="soft-card soft-form-panel mt-8" data-testid="surname-story-actions">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="soft-eyebrow">узнать бесплатно</p>
          <h2 className="soft-h3 mt-2">История вашей фамилии</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            По форме фамилии видно её происхождение, вероятное занятие или местность предков — бесплатно. Полный родовой разбор с родовой темой открывается баллами или картой.
          </p>
        </div>
        <span className={hasEntitlement ? "soft-badge soft-badge-warm" : "soft-badge"}>
          {hasEntitlement ? "разбор открыт" : "история бесплатно"}
        </span>
      </div>

      {message && (
        <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">{message}</p>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
        <div className="soft-card-flat p-5">
          <label className="soft-eyebrow" htmlFor="surname-input">Ваша фамилия</label>
          <input
            id="surname-input"
            value={surname}
            onChange={(event) => setSurname(event.target.value)}
            placeholder={PLACEHOLDER}
            className="soft-question-input mt-3"
            disabled={freeStatus === "loading"}
            onKeyDown={(event) => { if (event.key === "Enter") computeFreeStory(); }}
          />
          <Button
            type="button"
            onClick={computeFreeStory}
            disabled={freeStatus === "loading"}
            className="soft-button soft-button-primary mt-4 w-full"
            data-testid="surname-compute"
          >
            <Sparkles className="size-4" aria-hidden="true" />
            {freeStatus === "loading" ? "Читаем фамилию" : "Узнать историю бесплатно"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>

          {story && (
            <div className="mt-5">
              <Button type="button" onClick={shareStory} className="soft-button soft-button-ghost w-full" data-testid="surname-share">
                <Share2 className="size-4" aria-hidden="true" />
                Поделиться историей
              </Button>
              {shareNote && <p className="mt-2 text-xs text-[var(--soft-ink-soft)]">{shareNote}</p>}
            </div>
          )}

          {/* B391: мостик в Дизайн человека и натальную карту */}
          <div className="mt-5 border-t border-[var(--soft-paper-edge)] pt-4">
            <p className="soft-eyebrow text-[0.6rem]">что ещё про вас и род</p>
            <div className="mt-2 flex flex-col gap-2">
              <Link href="/products/human-design" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--soft-bordeaux)] underline underline-offset-4" data-testid="surname-bridge-hd">
                <Compass className="size-4" aria-hidden="true" /> Дизайн человека — ваш тип бесплатно
              </Link>
              <Link href="/products/natal-chart" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--soft-bordeaux)] underline underline-offset-4" data-testid="surname-bridge-natal">
                <Sparkles className="size-4" aria-hidden="true" /> Натальная карта — язык ваших тем
              </Link>
            </div>
          </div>
        </div>

        <div className="soft-card p-5">
          {story ? (
            <div className="grid gap-5">
              <StoryCard story={story} />

              <div className="border-t border-[var(--soft-paper-edge)] pt-5">
                <p className="soft-eyebrow">полный родовой разбор</p>
                {reading?.resultText ? (
                  <>
                    <SoftMarkdown content={reading.resultText} className="mt-3 font-heading text-[1.05rem] text-[var(--soft-ink)]" />
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button type="button" onClick={saveReading} disabled={reading.saved || readingStatus === "loading"} className="soft-button soft-button-ghost" data-testid="surname-save">
                        <Save className="size-4" aria-hidden="true" />
                        {reading.saved ? "Сохранено в Дневник" : "Сохранить в Дневник"}
                      </Button>
                      <a href={`/products/print/${reading.id}`} target="_blank" rel="noopener noreferrer" className="soft-button soft-button-ghost" data-testid="surname-pdf">
                        <Download className="size-4" aria-hidden="true" />
                        Скачать PDF
                      </a>
                    </div>
                  </>
                ) : reading?.previewText ? (
                  <>
                    <SoftMarkdown content={reading.previewText} className="mt-3 font-heading text-[1.05rem] text-[var(--soft-ink)]" />
                    <p className="mt-3 rounded-[14px] bg-[var(--soft-paper-deep)] p-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                      Это бесплатный фрагмент. Полный разбор раскроет родовую тему и что из неё может откликаться у вас сегодня.
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                    Полный разбор бережно соберёт вероятное происхождение, родовую тему и маленький следующий шаг.
                  </p>
                )}

                <div className="mt-4 flex flex-col gap-3">
                  {hasEntitlement ? (
                    <Button type="button" onClick={generateReading} disabled={readingStatus === "loading"} className="soft-button soft-button-primary" data-testid="surname-generate">
                      <LockKeyhole className="size-4" aria-hidden="true" />
                      {readingStatus === "loading" ? "Собираем разбор" : "Получить полный разбор"}
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Button>
                  ) : (
                    <>
                      <ProductPurchaseControls
                        productKey="surname-story"
                        label="Открыть полный родовой разбор"
                        checkoutSource="surname-story-direct"
                        creditCost={creditCost}
                        onUnlocked={() => {
                          setHasEntitlement(true);
                          void generateReading();
                        }}
                      />
                      <button
                        type="button"
                        onClick={generateReading}
                        disabled={readingStatus === "loading"}
                        className="self-start text-sm font-medium text-[var(--soft-bordeaux)] underline underline-offset-4 disabled:opacity-50"
                        data-testid="surname-free-fragment"
                      >
                        {readingStatus === "loading" ? "Собираем фрагмент…" : "Сначала бесплатный фрагмент"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid min-h-[18rem] place-items-center text-center">
              <div>
                <TreeDeciduous className="mx-auto size-10 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                <p className="mt-3 font-heading text-xl italic leading-relaxed text-[var(--soft-ink-soft)]">
                  Напишите фамилию — здесь появится её история и родовая тема.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
