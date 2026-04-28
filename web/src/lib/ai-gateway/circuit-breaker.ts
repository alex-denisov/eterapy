import { AIProvider } from "@prisma/client";
import type { AIGatewayFallbackAttempt } from "@/lib/ai-gateway/routing";
import type { AIRoutingPlan } from "@/lib/ai-gateway/routing";

const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_COOLDOWN_MS = 60_000;

export interface AIProviderCircuitState {
  provider: AIProvider;
  failureCount: number;
  openedUntil?: Date | null;
  lastFailureCode?: string | null;
}

export interface AIProviderCircuitOptions {
  failureThreshold?: number;
  cooldownMs?: number;
}

export function isProviderCircuitOpen(state: AIProviderCircuitState | undefined, now = new Date()) {
  if (!state?.openedUntil) return false;
  return state.openedUntil.getTime() > now.getTime();
}

export function applyAttemptToCircuitState(
  state: AIProviderCircuitState,
  attempt: AIGatewayFallbackAttempt,
  now = new Date(),
  options: AIProviderCircuitOptions = {}
): AIProviderCircuitState {
  if (attempt.status === "succeeded") {
    return {
      ...state,
      failureCount: 0,
      openedUntil: null,
      lastFailureCode: null,
    };
  }

  if (attempt.status === "skipped" || !attempt.retryable) {
    return state;
  }

  const failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const failureCount = state.failureCount + 1;

  return {
    ...state,
    failureCount,
    lastFailureCode: attempt.code ?? "PROVIDER_ERROR",
    openedUntil: failureCount >= failureThreshold ? new Date(now.getTime() + cooldownMs) : state.openedUntil ?? null,
  };
}

export function filterRoutingPlanByCircuit(input: {
  plan: AIRoutingPlan;
  states: Map<AIProvider, AIProviderCircuitState>;
  now?: Date;
}): { plan: AIRoutingPlan; skipped: AIGatewayFallbackAttempt[] } {
  const now = input.now ?? new Date();
  const skipped: AIGatewayFallbackAttempt[] = [];
  const attempts = input.plan.attempts.filter((attempt) => {
    const state = input.states.get(attempt.provider);
    if (!isProviderCircuitOpen(state, now)) return true;
    skipped.push({
      provider: attempt.provider,
      model: attempt.model,
      status: "skipped",
      code: "CIRCUIT_OPEN",
      retryable: true,
    });
    return false;
  });

  return {
    plan: {
      ...input.plan,
      attempts,
    },
    skipped,
  };
}
