/**
 * @jest-environment node
 */
import { isCloudflareAIGatewayUrl } from "@/lib/ai-gateway/openai-adapter";
import {
  buildCloudflareGatewayUrl,
  buildCloudflareGatewayUrlForAIProvider,
  getCloudflareGatewayConfig,
} from "@/lib/ai-gateway/cloudflare-gateway";
import { AIProvider } from "@prisma/client";

describe("OpenAI Cloudflare AI Gateway integration", () => {
  describe("isCloudflareAIGatewayUrl", () => {
    it("recognizes a CF Gateway URL", () => {
      expect(
        isCloudflareAIGatewayUrl("https://gateway.ai.cloudflare.com/v1/abc/eterapy-openai/openai"),
      ).toBe(true);
    });
    it("rejects the OpenAI direct URL", () => {
      expect(isCloudflareAIGatewayUrl("https://api.openai.com/v1")).toBe(false);
    });
    it("rejects empty / malformed URLs", () => {
      expect(isCloudflareAIGatewayUrl(undefined)).toBe(false);
      expect(isCloudflareAIGatewayUrl(null)).toBe(false);
      expect(isCloudflareAIGatewayUrl("")).toBe(false);
      expect(isCloudflareAIGatewayUrl("not a url")).toBe(false);
    });
  });

  describe("buildCloudflareGatewayUrl", () => {
    it("builds the expected URL shape", () => {
      expect(
        buildCloudflareGatewayUrl({
          accountId: "abc123",
          gatewayId: "eterapy-openai",
          provider: "openai",
        }),
      ).toBe("https://gateway.ai.cloudflare.com/v1/abc123/eterapy-openai/openai");
    });

    it("builds Anthropic and OpenRouter gateway URL shapes", () => {
      expect(buildCloudflareGatewayUrl({
        accountId: "abc123",
        gatewayId: "eterapy-openai",
        provider: "anthropic",
      })).toBe("https://gateway.ai.cloudflare.com/v1/abc123/eterapy-openai/anthropic");
      expect(buildCloudflareGatewayUrl({
        accountId: "abc123",
        gatewayId: "eterapy-openai",
        provider: "openrouter",
      })).toBe("https://gateway.ai.cloudflare.com/v1/abc123/eterapy-openai/openrouter");
    });

    it("builds OpenAI-compatible gateway URL shapes for direct providers", () => {
      expect(buildCloudflareGatewayUrlForAIProvider({
        accountId: "abc123",
        gatewayId: "eterapy-openai",
        provider: AIProvider.GROQ,
      })).toBe("https://gateway.ai.cloudflare.com/v1/abc123/eterapy-openai/groq");
      expect(buildCloudflareGatewayUrlForAIProvider({
        accountId: "abc123",
        gatewayId: "eterapy-openai",
        provider: AIProvider.MISTRAL,
      })).toBe("https://gateway.ai.cloudflare.com/v1/abc123/eterapy-openai/mistral");
      expect(buildCloudflareGatewayUrlForAIProvider({
        accountId: "abc123",
        gatewayId: "eterapy-openai",
        provider: AIProvider.CEREBRAS,
      })).toBe("https://gateway.ai.cloudflare.com/v1/abc123/eterapy-openai/cerebras");
      expect(buildCloudflareGatewayUrlForAIProvider({
        accountId: "abc123",
        gatewayId: "eterapy-openai",
        provider: AIProvider.COHERE,
      })).toBe("https://gateway.ai.cloudflare.com/v1/abc123/eterapy-openai/cohere/compatibility/v1");
      expect(buildCloudflareGatewayUrlForAIProvider({
        accountId: "abc123",
        gatewayId: "eterapy-openai",
        provider: AIProvider.GEMINI,
      })).toBe("https://gateway.ai.cloudflare.com/v1/abc123/eterapy-openai/google-ai-studio/v1beta");
    });
  });

  describe("getCloudflareGatewayConfig", () => {
    const originalEnv = { ...process.env };
    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it("returns null when account or gateway id missing", () => {
      delete process.env.CF_AI_GATEWAY_ACCOUNT_ID;
      delete process.env.CF_AI_GATEWAY_ID;
      expect(getCloudflareGatewayConfig()).toBeNull();
    });

    it("returns config with hasToken=false when token missing", () => {
      process.env.CF_AI_GATEWAY_ACCOUNT_ID = "acc";
      process.env.CF_AI_GATEWAY_ID = "gw";
      delete process.env.CF_AI_GATEWAY_TOKEN;
      expect(getCloudflareGatewayConfig()).toEqual({
        accountId: "acc",
        gatewayId: "gw",
        hasToken: false,
      });
    });

    it("returns config with hasToken=true when token present", () => {
      process.env.CF_AI_GATEWAY_ACCOUNT_ID = "acc";
      process.env.CF_AI_GATEWAY_ID = "gw";
      process.env.CF_AI_GATEWAY_TOKEN = "cfut_xxx";
      expect(getCloudflareGatewayConfig()).toEqual({
        accountId: "acc",
        gatewayId: "gw",
        hasToken: true,
      });
    });
  });
});
