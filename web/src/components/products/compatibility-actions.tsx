"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, CheckCircle2, Copy, Flag, RefreshCcw, LockKeyhole, Share2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductIntake } from "@/components/products/product-intake";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { PairSelfViewIntake } from "@/components/products/pair-self-view-intake";
import { readingIdFromSearch, withReadingParam } from "@/lib/pair-hub";
import type { PairRelationshipType } from "@/lib/pair-hub";

// B465: pin the active compatibility to the URL (`?reading=<id>`) so refresh/back
// restores this session; a bare visit (no pending invite) starts fresh.
function pinReadingUrl(id: string) {
  if (typeof window === "undefined") return;
  window.history.replaceState(
    null,
    "",
    withReadingParam(window.location.pathname, window.location.search, id),
  );
}

type CompatibilityResult = {
  id: string;
  status: string; // CREATED | INVITED | PARTNER_COMPLETED | READY | DELETED
  type: string;
  inviteToken: string;
  creatorConsent: boolean;
  partnerConsent: boolean;
  creatorId: string;
  partnerId: string | null;
  reportId: string | null;
  viewerRole?: "creator" | "partner" | "invitee";
};

type ApiPayload = {
  hasEntitlement?: boolean;
  result?: CompatibilityResult;
  results?: CompatibilityResult[];
  checkout?: { productKey: string; checkoutSource: string };
  teaserText?: string;
  paywalled?: boolean;
  error?: string;
};

const FEATURES = [
  ["Сценарии общения", "Какие повторяющиеся диалоги уносят больше всего энергии — и где есть выход."],
  ["Языки заботы", "Как каждый показывает любовь — и где вы говорите на разных языках."],
  ["Зоны согласия", "О чём вы думаете похоже, даже если кажется иначе."],
  ["Точки напряжения", "Темы, в которых стоит говорить осторожно — и как их обойти."],
  ["Совместный шаг", "Один аккуратный эксперимент на ближайшие 7 дней."],
  ["Когда нужен специалист", "Если в отчёте появятся темы, требующие живого разговора."],
] as const;

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error((payload as ApiPayload).error ?? "Не удалось выполнить действие");
    (error as Error & { status?: number; payload?: unknown }).status = response.status;
    (error as Error & { status?: number; payload?: unknown }).payload = payload;
    throw error;
  }
  return payload as T;
}

export function CompatibilityActions({
  dialogueId,
  inviteToken,
  productKey = "compatibility",
  relationshipType = "romantic",
}: {
  dialogueId?: string | null;
  inviteToken?: string | null;
  productKey?: "compatibility" | "pair";
  // B463: «Ваша связь» relationship type, threaded from the pair self-view intake so
  // the invite carries the right `type` (it feeds the compatibility engine prompt).
  relationshipType?: PairRelationshipType;
}) {
  const { status: authStatus } = useSession();
  const [result, setResult] = useState<CompatibilityResult | null>(null);
  const [hasEntitlement, setHasEntitlement] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "paying" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const isAuthenticated = authStatus === "authenticated";
  const partnerDialogueId = dialogueId ?? null;

  useEffect(() => {
    if (!inviteToken && authStatus !== "authenticated") return;
    let cancelled = false;
    // ?reading=<id> pins the active session. In the pair compare flow it can also
    // be the logged-in client's invite entry, so the API returns the viewer role.
    const currentSearch = typeof window !== "undefined" ? window.location.search : "";
    const searchParams = new URLSearchParams(currentSearch);
    const urlReadingId = inviteToken
      ? null
      : readingIdFromSearch(searchParams);
    const readingId =
      productKey === "pair" && !dialogueId && searchParams.get("scenario") === "compare"
        ? null
        : urlReadingId;
    if (productKey === "pair" && !inviteToken && !dialogueId && !readingId) {
      queueMicrotask(() => {
        if (cancelled) return;
        setResult(null);
        setHasEntitlement(false);
      });
      return () => { cancelled = true; };
    }
    const isReadingInvite = Boolean(readingId && productKey === "pair" && searchParams.get("scenario") === "compare");
    const url = inviteToken
      ? `/api/products/compatibility/invite/${encodeURIComponent(inviteToken)}`
      : readingId
        ? `/api/products/compatibility/${encodeURIComponent(readingId)}?productKey=${productKey}${isReadingInvite ? "&asInvite=1" : ""}`
        : dialogueId
          ? `/api/products/compatibility?dialogueId=${encodeURIComponent(dialogueId)}&productKey=${productKey}`
          : `/api/products/compatibility?productKey=${productKey}`;
    jsonRequest<ApiPayload>(url)
      .then((payload) => {
        if (cancelled) return;
        setHasEntitlement(Boolean(payload.hasEntitlement));
        const restored = payload.results?.[0] ?? payload.result ?? null;
        setResult(restored);
        // Fresh visit that resumed a pending invite → pin it so it becomes a proper,
        // refresh-safe session (matches the rest of the services).
        if (!inviteToken && !readingId && restored?.id) pinReadingUrl(restored.id);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [authStatus, dialogueId, inviteToken, productKey]);

  async function createInvite() {
    if (!dialogueId) return;
    if (!isAuthenticated) {
      setMessage("Войдите, чтобы создать приглашение и открыть совместимость через баллы или карту.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>("/api/products/compatibility", {
        method: "POST",
        body: JSON.stringify({ dialogueId, type: relationshipType, action: "create_invite", productKey }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      const created = payload.result ?? null;
      setResult(created);
      if (created?.id) pinReadingUrl(created.id);
      if (payload.paywalled) {
        setMessage(payload.teaserText ?? "Бесплатный фрагмент готов. Полная карта откроется после оплаты.");
      }
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать приглашение");
      setStatus("error");
    }
  }

  async function submitPartnerPart() {
    if (!result?.id || !partnerDialogueId) return;
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>(`/api/products/compatibility/${result.id}/partner-part`, {
        method: "POST",
        body: JSON.stringify({ dialogueId: partnerDialogueId, partnerConsent: true, viaReading: !inviteToken }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setResult(payload.result ?? null);
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отправить вашу часть");
      setStatus("error");
    }
  }

  async function declineInvite(report = false) {
    if (!result?.id) return;
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>(`/api/products/compatibility/${result.id}/decline`, {
        method: "POST",
        body: JSON.stringify({
          report,
          reason: report ? "Приглашение кажется небезопасным или нежелательным" : "Партнер отказался от участия",
        }),
      });
      setResult(payload.result ?? null);
      setMessage(report ? "Приглашение отправлено на проверку." : "Приглашение отклонено.");
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось обновить приглашение");
      setStatus("error");
    }
  }

  async function generateReport() {
    if (!result?.id) return;
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>(`/api/products/compatibility/${result.id}/generate`, {
        method: "POST",
        body: JSON.stringify({ creatorConsent: true }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      const generated = payload.result ?? null;
      setResult(generated);
      if (generated?.id) pinReadingUrl(generated.id);
      setStatus("idle");
    } catch (error) {
      const typed = error as Error & { status?: number; payload?: ApiPayload };
      if (typed.status === 402) {
        setMessage("Откройте доступ к совместимости баллами или картой — ответы партнеров останутся на месте.");
        setStatus("error");
        return;
      }
      setMessage(typed.message || "Не удалось получить разбор");
      setStatus("error");
    }
  }

  function copyInviteLink() {
    if (!result?.inviteToken) return;
    // Invite link stays on the same product the inviter used so the
    // partner sees the same context ("Вас пригласили на разбор
    // совместимости") instead of being thrown into a blank dialogue.
    const slug = productKey === "pair" ? "pair" : "compatibility";
    const url = `${window.location.origin}/products/${slug}?invite=${result.inviteToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const viewerRole = result?.viewerRole ?? (inviteToken ? "invitee" : "creator");
  const isPartnerEntry = Boolean(
    result && (result.viewerRole === "invitee" || result.viewerRole === "partner" || (inviteToken && viewerRole !== "creator")),
  );

  // Partner view — invited to fill their part
  if (isPartnerEntry && result && (result.status === "INVITED" || result.status === "CREATED")) {
    return (
      <div className="soft-card soft-form-panel mt-8" data-testid="compatibility-actions-partner">
        <p className="soft-eyebrow">приглашение</p>
        <h2 className="soft-h3 mt-2">Вас пригласили на разбор совместимости</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Ваш партнер ответил на свои вопросы. Теперь ваша очередь. Ваши ответы будут скрыты от партнера, а партнерские — от вас. Вы оба увидите только итоговый отчет.
        </p>

        {message && (
          <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">
            {message}
          </p>
        )}

        {!partnerDialogueId ? (
          <ProductIntake
            productKey={productKey}
            mode="light"
            title="Ответьте на свою часть"
            description="Один ввод останется привязан к этому приглашению. Партнёр не увидит ваш текст, только итоговый совместный отчёт после согласия."
            promptLabel="Ваш взгляд"
            placeholder="Что для вас важно в этой связи? Где тепло, где напряжение, какой вопрос хочется прояснить?"
            submitLabel="Сохранить свою часть"
            readyLabel="Ваша часть готова. Возвращаем вас к приглашению."
            testId="compatibility-partner-intake"
          />
        ) : (
          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={submitPartnerPart} disabled={status === "loading"} className="soft-button soft-button-primary">
              Отправить свои ответы и дать согласие
              <CheckCircle2 className="size-4" aria-hidden="true" />
            </Button>
            <Button onClick={() => declineInvite(false)} disabled={status === "loading"} className="soft-button soft-button-ghost" data-testid="pair-decline-invite">
              <XCircle className="size-4" aria-hidden="true" />
              Отклонить
            </Button>
            <Button onClick={() => declineInvite(true)} disabled={status === "loading"} className="soft-button soft-button-ghost" data-testid="pair-report-invite">
              <Flag className="size-4" aria-hidden="true" />
              Пожаловаться
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (isPartnerEntry && result?.status === "PARTNER_COMPLETED") {
    return (
      <div className="soft-card soft-form-panel mt-8" data-testid="compatibility-actions-partner-done">
        <p className="soft-eyebrow">ваша часть сохранена</p>
        <h2 className="soft-h3 mt-2">Ответы приняты</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Теперь владелец разбора сможет открыть совместный отчёт. Ваш исходный текст останется скрытым, в отчёте появится только общая картина.
        </p>
      </div>
    );
  }

  if (isPartnerEntry && result?.status === "READY") {
    return (
      <div className="soft-card soft-form-panel mt-8" data-testid="compatibility-actions-partner-ready">
        <p className="soft-eyebrow">разбор готов</p>
        <h2 className="soft-h3 mt-2">Совместный отчёт открыт</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Отчёт доступен в личном кабинете. Вы увидите только итоговый разбор, без приватных ответов друг друга.
        </p>
        <Link href="/cabinet/diary" className="soft-button soft-button-primary mt-4 flex w-full justify-center">
          Посмотреть разбор
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  // No dialogue yet — CTA to start. B463: «Вместе» uses the «Ваша связь» guided
  // self-view (relationship-type + warmth/tension/optional question); the legacy
  // standalone compatibility keeps the single-field intake.
  if (!dialogueId && !result) {
    if (productKey === "pair") {
      return <PairSelfViewIntake />;
    }
    return (
      <ProductIntake
        productKey={productKey}
        mode="light"
        title="Сначала ваша сторона совместимости"
        description="Один ввод создаст контекст услуги прямо здесь. Затем вы сможете отправить партнёру ссылку без перехода в общий первичный разбор."
        promptLabel="Ваш взгляд на связь"
        placeholder="Опишите ситуацию, ожидания и то, что хочется аккуратно прояснить вместе."
        submitLabel="Начать со своей стороны"
        readyLabel="Контекст готов. Возвращаем вас к приглашению."
        testId="compatibility-no-dialogue"
      />
    );
  }

  return (
    <div className="soft-card soft-form-panel mt-8" data-testid="compatibility-actions">
      {/* Invite card — purple gradient, two circles */}
      <div
        className="rounded-[20px] p-5"
        style={{ background: "linear-gradient(140deg, #DBD3EA, #E8E1F2)" }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 48px 1fr", gap: 16, alignItems: "center" }}>
          {/* You */}
          <div
            className="rounded-[16px] p-5 text-center"
            style={{ background: "var(--soft-paper-card)" }}
          >
            <div
              className="mx-auto flex items-center justify-center rounded-full font-heading text-2xl font-semibold"
              style={{ width: 56, height: 56, background: "var(--soft-rose, #F4D9C1)", color: "var(--soft-bordeaux)" }}
            >
              М
            </div>
            <p className="mt-3 font-heading text-[1.05rem] font-medium text-[var(--soft-bordeaux)]">Вы</p>
            <p className="mt-0.5 text-xs text-[var(--soft-ink-soft)]">ваша часть готова</p>
          </div>

          {/* Plus separator */}
          <div className="text-center font-heading text-2xl italic text-[var(--soft-bordeaux)]">+</div>

          {/* Partner */}
          <div
            className="rounded-[16px] p-5 text-center"
            style={{ background: "var(--soft-paper-card)" }}
          >
            <div
              className="mx-auto flex items-center justify-center rounded-full font-heading text-2xl font-semibold"
              style={{ width: 56, height: 56, background: "var(--soft-paper-edge)", color: "var(--soft-ink-faint)" }}
            >
              ?
            </div>
            <p className="mt-3 font-heading text-[1.05rem] font-medium text-[var(--soft-ink-faint)]">Партнёр</p>
            <p className="mt-0.5 text-xs text-[var(--soft-ink-faint)]">
              {result?.status === "PARTNER_COMPLETED" ? "заполнил свою часть" : "отправьте приглашение"}
            </p>
          </div>
        </div>

        {message && (
          <p className="mt-4 rounded-2xl bg-white/60 p-3 text-sm text-[var(--soft-bordeaux)]">
            {message}
          </p>
        )}

        {/* Not started — create invite */}
        {!result && viewerRole === "creator" && (
          <>
            <Button
              onClick={createInvite}
              disabled={status === "loading"}
              className="soft-button soft-button-primary mt-5 w-full justify-center"
            >
              Создать ссылку-приглашение
              <Share2 className="size-4" aria-hidden="true" />
            </Button>
            <p className="mt-3 text-center text-xs text-[var(--soft-ink-faint)]">
              Партнёр пройдёт свой разбор отдельно. Когда оба готовы — отчёт открывается обоим одновременно.
            </p>
          </>
        )}

        {/* Invite created — show link */}
        {result?.status === "INVITED" && viewerRole === "creator" && (
          <>
            <p className="mt-4 text-sm text-[var(--soft-ink-soft)]">Ссылка для партнёра готова. Как только он ответит — статус обновится.</p>
            <div className="mt-3 flex items-center gap-2">
              <input
                readOnly
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/products/${productKey === "pair" ? "pair" : "compatibility"}?invite=${result.inviteToken}`}
                className="soft-question-input flex-1 py-2 text-base"
              />
              <Button onClick={copyInviteLink} className="soft-button soft-button-ghost shrink-0">
                {copied ? <CheckCircle2 className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
            <Button onClick={() => window.location.reload()} className="soft-button soft-button-ghost mt-3 w-full justify-center">
              <RefreshCcw className="size-4" />
              Обновить статус
            </Button>
          </>
        )}

        {/* Partner completed — generate */}
        {result?.status === "PARTNER_COMPLETED" && viewerRole === "creator" && (
          <>
            <p className="mt-4 text-sm text-[var(--soft-ink-soft)]">Партнер заполнил свою часть и дал согласие. Теперь вы можете получить разбор.</p>
            <Button
              onClick={generateReport}
              disabled={status === "loading" || status === "paying"}
              className="soft-button soft-button-primary mt-4 w-full justify-center"
            >
              <LockKeyhole className="size-4" aria-hidden="true" />
              {hasEntitlement ? "Получить полный разбор" : "Показать бесплатный фрагмент"}
            </Button>
            {!hasEntitlement && (
              <div className="mt-3">
                <ProductPurchaseControls
                  productKey={productKey}
                  label="Открыть полную карту"
                  checkoutSource="compatibility-generate"
                  creditCost={3}
                  // B554 п.25: у совместимости «пустой формы» быть не может —
                  // кнопка живёт только в ветке PARTNER_COMPLETED, где ответы
                  // обеих сторон уже есть. Guard страхует от оплаты сессии,
                  // которая успела пропасть между рендером и нажатием.
                  beforePay={() => (result?.id ? null : "Сессия разбора не найдена. Обновите страницу и попробуйте ещё раз.")}
                  onUnlocked={() => { setHasEntitlement(true); void generateReport(); }}
                />
              </div>
            )}
          </>
        )}

        {/* Declined / Review */}
        {result && (result.status === "DECLINED" || result.status === "REVIEW") && (
          <p className="mt-4 rounded-2xl bg-white/60 p-3 text-sm text-[var(--soft-bordeaux)]">
            {result.status === "REVIEW"
              ? "Приглашение остановлено и отправлено на проверку."
              : "Партнер отклонил приглашение. Можно вернуться к своему разбору без совместного отчета."}
          </p>
        )}

        {/* Ready */}
        {result?.status === "READY" && (
          <>
            <p className="mt-4 text-sm text-[var(--soft-ink-soft)]">Разбор готов и доступен обоим партнерам в личном кабинете.</p>
            <Link href="/cabinet/diary" className="soft-button soft-button-primary mt-4 flex w-full justify-center">
              Посмотреть разбор
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </>
        )}
      </div>

      {/* Features grid */}
      <h3 className="soft-h3 mt-8 mb-4">Что покажет совместный отчёт</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FEATURES.map(([title, desc]) => (
          <div key={title} className="soft-card-flat rounded-[16px] p-4">
            <p className="font-heading text-[0.95rem] font-medium text-[var(--soft-bordeaux)]">{title}</p>
            <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
