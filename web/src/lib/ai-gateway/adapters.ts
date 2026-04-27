import type { AIProvider } from "@prisma/client";
import type { AIGatewayMessage } from "@/lib/ai-gateway/domain";

export interface AIGatewayCompletionRequest {
  requestId?: string;
  feature: string;
  messages: AIGatewayMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface AIGatewayCompletionResponse {
  text: string;
  provider: AIProvider;
  model: string;
  finishReason?: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
}

export interface AIProviderHealth {
  provider: AIProvider;
  status: "ok" | "missing_config" | "down";
  model?: string;
  latencyMs?: number;
  message?: string;
}

export interface AIGatewayAdapter {
  provider: AIProvider;
  complete(request: AIGatewayCompletionRequest): Promise<AIGatewayCompletionResponse>;
  healthcheck(model?: string): Promise<AIProviderHealth>;
}

export class AIProviderError extends Error {
  provider: AIProvider;
  code: string;
  retryable: boolean;

  constructor(message: string, options: { provider: AIProvider; code: string; retryable?: boolean; cause?: unknown }) {
    super(message);
    this.name = "AIProviderError";
    this.provider = options.provider;
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.cause = options.cause;
  }
}

export function classifyProviderError(err: unknown) {
  const status = typeof err === "object" && err !== null && "status" in err
    ? Number((err as { status?: unknown }).status)
    : undefined;
  const code = typeof err === "object" && err !== null && "code" in err
    ? String((err as { code?: unknown }).code)
    : status
      ? `HTTP_${status}`
      : "PROVIDER_ERROR";

  return {
    code,
    retryable: status === 408 || status === 409 || status === 429 || (status !== undefined && status >= 500),
  };
}
