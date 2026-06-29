"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, Heart, Users, Home, Briefcase, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PAIR_RELATIONSHIP_OPTIONS,
  PAIR_TENSION_PROMPT,
  PAIR_QUESTION_PROMPT,
  composePairSelfView,
  defaultPairRelationship,
  getPairRelationshipOption,
  type PairRelationshipType,
} from "@/lib/pair-hub";

// B463 (M28): «Ваша связь» — the two-party self-view intake inside «Сверить взгляды».
// A relationship-type chooser re-skins three calm guided prompts; the answers fold into
// the single free-text the compatibility engine accepts (composePairSelfView). On
// success it hands the created dialogue + chosen type back to the parent (via URL) so
// the invite step carries the right relationship `type`.

const RELATIONSHIP_ICON: Record<PairRelationshipType, LucideIcon> = {
  romantic: Heart,
  friendship: Users,
  family: Home,
  business: Briefcase,
};

export function PairSelfViewIntake() {
  const router = useRouter();
  const [type, setType] = useState<PairRelationshipType>(defaultPairRelationship().key);
  const [warmth, setWarmth] = useState("");
  const [tension, setTension] = useState("");
  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState<"idle" | "loading" | "safety">("idle");
  const [error, setError] = useState("");

  const option = getPairRelationshipOption(type) ?? defaultPairRelationship();
  const ready = warmth.trim().length >= 3 && tension.trim().length >= 3;

  async function submit() {
    if (!ready || phase === "loading") return;
    setError("");
    setPhase("loading");
    try {
      const text = composePairSelfView({ type, warmth, tension, question });
      const response = await fetch("/api/dialogues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, intakeProductKey: "pair", intakeMode: "light" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Не удалось сохранить вашу сторону");
      }
      const dialogue = data.dialogue as { id: string; status?: string; safety?: { interrupt?: boolean } } | undefined;
      if (!dialogue?.id) throw new Error("Не удалось сохранить вашу сторону");
      if (dialogue.status === "SAFETY_INTERRUPTED" || dialogue.safety?.interrupt) {
        setPhase("safety");
        return;
      }
      // Hand the dialogue + relationship type to the invite step via the URL, so the
      // compatibility invite carries the chosen `type` (it feeds the engine prompt).
      const url = new URL(window.location.href);
      url.searchParams.set("scenario", "compare");
      url.searchParams.set("dialogueId", dialogue.id);
      url.searchParams.set("relType", type);
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить вашу сторону");
      setPhase("idle");
    }
  }

  const disabled = phase === "loading";

  return (
    <div className="soft-card soft-form-panel" data-testid="pair-self-view-intake">
      <p className="soft-eyebrow">ваша связь</p>
      <h2 className="soft-h3 mt-2">Сначала ваша сторона</h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
        Ответьте со своей стороны — партнёр ответит отдельно. Его слов вы не увидите,
        только общий итог, и только по согласию обоих.
      </p>

      <p className="soft-eyebrow mt-5 text-[var(--soft-terracotta-dark)]">тип связи</p>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Тип связи" data-testid="pair-relationship-picker">
        {PAIR_RELATIONSHIP_OPTIONS.map((relationship) => {
          const Icon = RELATIONSHIP_ICON[relationship.key];
          const isActive = relationship.key === type;
          return (
            <button
              key={relationship.key}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => setType(relationship.key)}
              className={`tarot-choice inline-flex items-center gap-1.5 ${isActive ? "tarot-choice-active" : ""}`}
              data-testid={`pair-relationship-${relationship.key}`}
              data-active={isActive}
              disabled={disabled}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {relationship.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid gap-4">
        <label className="grid gap-1.5">
          <span className="text-sm font-medium text-[var(--soft-ink)]">{option.warmthPrompt}</span>
          <textarea
            value={warmth}
            onChange={(event) => setWarmth(event.target.value.slice(0, 600))}
            placeholder="Несколько слов…"
            rows={2}
            className="soft-question-input tarot-question-input p-3"
            disabled={disabled}
            data-testid="pair-warmth-input"
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-medium text-[var(--soft-ink)]">{PAIR_TENSION_PROMPT}</span>
          <textarea
            value={tension}
            onChange={(event) => setTension(event.target.value.slice(0, 600))}
            placeholder="Несколько слов…"
            rows={2}
            className="soft-question-input tarot-question-input p-3"
            disabled={disabled}
            data-testid="pair-tension-input"
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-medium text-[var(--soft-ink-soft)]">{PAIR_QUESTION_PROMPT}</span>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value.slice(0, 400))}
            placeholder="Если хочется прояснить что-то одно"
            rows={2}
            className="soft-question-input tarot-question-input p-3"
            disabled={disabled}
            data-testid="pair-question-input"
          />
        </label>
      </div>

      <div className="mt-4 flex gap-2 rounded-[var(--soft-radius-md)] bg-[var(--soft-paper-deep)] p-3 text-xs leading-relaxed text-[var(--soft-ink-soft)]">
        <LockKeyhole className="mt-0.5 size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
        <span>Партнёр ответит отдельно. Его слов вы не увидите — только общий итог, и только по согласию обоих.</span>
      </div>

      <Button
        type="button"
        onClick={() => void submit()}
        disabled={disabled || !ready}
        className="soft-button soft-button-primary mt-4"
        data-testid="pair-self-view-submit"
      >
        {disabled ? "Сохраняем вашу сторону" : "Создать приглашение"}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Button>

      {phase === "safety" && (
        <p className="mt-4 rounded-[var(--soft-radius-lg)] bg-[var(--soft-paper-deep)] p-4 text-sm leading-relaxed text-[var(--soft-bordeaux)]">
          Похоже, тема может быть небезопасной для автоматического разбора. Лучше обратиться
          к живой поддержке или экстренным службам, если есть риск для жизни и здоровья.
        </p>
      )}
      {error && <p className="mt-4 text-sm text-[var(--soft-bordeaux)]">{error}</p>}
    </div>
  );
}
