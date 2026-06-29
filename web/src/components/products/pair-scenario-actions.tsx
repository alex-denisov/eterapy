"use client";

import { useEffect, useState } from "react";
import { Eye, Users } from "lucide-react";
import { TogetherActions } from "@/components/products/together-actions";
import { CompatibilityActions } from "@/components/products/compatibility-actions";
import {
  PAIR_HUB_SCENARIOS,
  type PairHubScenarioKey,
  type PairRelationshipType,
} from "@/lib/pair-hub";

// B463 (M28, walkthrough item 21): the «Вместе» hub picker. Two scenarios as pills;
// selecting one swaps the intake INLINE (no reload). A plain description sits under the
// picker and is divided from the intake below, so the form never butts up against the
// hint text. The «Совместимость» card is gone — its whole-relationship reflection lives
// inside «Сверить взгляды» as the «Ваша связь» mode (see compatibility-actions.tsx).

const SCENARIO_ICON: Record<PairHubScenarioKey, typeof Eye> = {
  outside: Eye,
  compare: Users,
};

export function PairScenarioActions({
  initialScenario,
  dialogueId = null,
  relationshipType = "romantic",
}: {
  initialScenario: PairHubScenarioKey;
  // Threaded from the page after the «Ваша связь» self-view creates a dialogue, so the
  // compatibility invite step renders with the right context + relationship type.
  dialogueId?: string | null;
  relationshipType?: PairRelationshipType;
}) {
  const [active, setActive] = useState<PairHubScenarioKey>(initialScenario);

  // Keep ?scenario= in the URL so deep-links and the profile back-arrow restore the
  // chosen scenario, without a force-dynamic refetch (single history entry).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (active === "compare") {
      url.searchParams.set("scenario", "compare");
    } else {
      url.searchParams.delete("scenario");
    }
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  }, [active]);

  const activeScenario =
    PAIR_HUB_SCENARIOS.find((scenario) => scenario.key === active) ?? PAIR_HUB_SCENARIOS[0];

  return (
    <div data-testid="pair-scenario-actions">
      <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">кто будет отвечать?</p>

      <div
        className="mt-3 flex gap-2"
        role="tablist"
        aria-label="Формат разбора"
        data-testid="pair-scenario-picker"
      >
        {PAIR_HUB_SCENARIOS.map((scenario) => {
          const Icon = SCENARIO_ICON[scenario.key];
          const isActive = scenario.key === active;
          return (
            <button
              key={scenario.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(scenario.key)}
              className={`tarot-choice flex-1 inline-flex items-center justify-center gap-2 ${
                isActive ? "tarot-choice-active" : ""
              }`}
              data-testid={`pair-scenario-pill-${scenario.key}`}
              data-active={isActive}
            >
              <Icon className="size-4" aria-hidden="true" />
              {scenario.label}
            </button>
          );
        })}
      </div>

      <p
        className="mt-3 rounded-[var(--soft-radius-md)] bg-[var(--soft-paper-deep)] p-3.5 text-sm leading-relaxed text-[var(--soft-ink-soft)]"
        data-testid="pair-scenario-description"
      >
        {activeScenario.description}
      </p>

      <div data-testid="pair-scenario-intake">
        {active === "outside" ? (
          <TogetherActions inviteToken={null} />
        ) : (
          <CompatibilityActions
            inviteToken={null}
            productKey="pair"
            dialogueId={dialogueId}
            relationshipType={relationshipType}
          />
        )}
      </div>
    </div>
  );
}
