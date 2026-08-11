/**
 * B703 — ключи коннекторов доезжают выкаткой, а не рукой в панели.
 *
 * Прогон держит границы бутстрапа. Каждая из них — не украшение: без первой
 * коннектор гаснет на выкатке с неполным оверлеем, без второй выключатель в
 * суперадминке перестаёт что-либо значить, без третьей отказ одного провайдера
 * уносит остальные шесть.
 */

import { AIProvider } from "@prisma/client";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    aIProviderConfig: { upsert: jest.fn() },
    aIProviderCredential: { upsert: jest.fn() },
  },
}));

jest.mock("@/lib/ai-gateway/credentials-crypto", () => ({
  __esModule: true,
  encryptSecret: jest.fn((value: string) => `enc:${value}`),
  isAICredentialEncryptionConfigured: jest.fn(() => true),
}));

import db from "@/lib/db";
import { isAICredentialEncryptionConfigured } from "@/lib/ai-gateway/credentials-crypto";
import {
  bootstrapFreeTierLLMProviders,
  FREE_TIER_CREDENTIAL_LABEL,
  FREE_TIER_ENV_KEYS,
} from "@/lib/ai-gateway/free-tier-bootstrap";
import { FREE_TIER_LLM_PROVIDERS } from "@/lib/ai-gateway/provider-runtime";

const configUpsert = db.aIProviderConfig.upsert as unknown as jest.Mock;
const credentialUpsert = db.aIProviderCredential.upsert as unknown as jest.Mock;
const encryptionConfigured = isAICredentialEncryptionConfigured as unknown as jest.Mock;

function clearKeys() {
  for (const name of Object.values(FREE_TIER_ENV_KEYS)) delete process.env[name];
}

describe("B703 · бутстрап коннекторов из оверлея", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    encryptionConfigured.mockReturnValue(true);
    configUpsert.mockResolvedValue({});
    credentialUpsert.mockResolvedValue({});
    clearKeys();
  });

  afterEach(clearKeys);

  it("имена переменных совпадают с infra-credentials.env владельца", () => {
    // Переименование «для единообразия» читалось бы как «ключа нет».
    expect(FREE_TIER_ENV_KEYS[AIProvider.KILOCODE]).toBe("KILO_CODE_AI_API_KEY");
    expect(FREE_TIER_ENV_KEYS[AIProvider.NVIDIA]).toBe("NVIDIA_NIM_API_KEY");
    expect(FREE_TIER_ENV_KEYS[AIProvider.OPENCODE_ZEN]).toBe("OPENCODE_ZEN_AI_API_KEY");
    expect(FREE_TIER_ENV_KEYS[AIProvider.TOKENROUTER]).toBe("TOKENROUTER_API_KEY");
    expect(FREE_TIER_ENV_KEYS[AIProvider.SAMBANOVA]).toBe("SAMBANOVA_CLOUD_API_KEY");
    expect(FREE_TIER_ENV_KEYS[AIProvider.POLLINATIONS]).toBe("POLLINATIONS_AI_API_KEY");
    expect(FREE_TIER_ENV_KEYS[AIProvider.HUGGINGFACE]).toBe("HUGGINGFACE_HUB_API_KEY");
    expect(Object.keys(FREE_TIER_ENV_KEYS)).toHaveLength(FREE_TIER_LLM_PROVIDERS.length);
  });

  it("заданный ключ поднимает и провайдера, и строку ключа", async () => {
    process.env.NVIDIA_NIM_API_KEY = "nv-secret";

    const result = await bootstrapFreeTierLLMProviders();

    expect(result.configured).toEqual([AIProvider.NVIDIA]);
    expect(configUpsert).toHaveBeenCalledTimes(1);
    expect(credentialUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { provider_label: { provider: AIProvider.NVIDIA, label: FREE_TIER_CREDENTIAL_LABEL } },
      create: expect.objectContaining({ encryptedKey: "enc:nv-secret", enabled: true }),
    }));
  });

  it("провайдер без ключа в оверлее не трогается вовсе", async () => {
    // Иначе выкатка с неполным оверлеем гасила бы живой коннектор.
    process.env.SAMBANOVA_CLOUD_API_KEY = "sn-secret";

    const result = await bootstrapFreeTierLLMProviders();

    expect(result.configured).toEqual([AIProvider.SAMBANOVA]);
    expect(result.missingKey).toHaveLength(FREE_TIER_LLM_PROVIDERS.length - 1);
    expect(configUpsert).toHaveBeenCalledTimes(1);
  });

  it("повторный заход не включает провайдера обратно", async () => {
    process.env.TOKENROUTER_API_KEY = "tr-secret";

    await bootstrapFreeTierLLMProviders();

    // `enabled` живёт только в create: оператор, выключивший сбоящий коннектор,
    // не должен получать его обратно на ближайшем старте воркера.
    const call = configUpsert.mock.calls[0][0];
    expect(call.create.enabled).toBe(true);
    expect(call.update).not.toHaveProperty("enabled");
    // Адрес и модель, наоборот, догоняют код: опечатка в хосте чинится
    // выкаткой, а не походом в панель.
    expect(call.update).toHaveProperty("baseUrl");
    expect(call.update).toHaveProperty("defaultModel");
  });

  it("отказ по одному провайдеру не уносит остальных", async () => {
    process.env.KILO_CODE_AI_API_KEY = "kilo-secret";
    process.env.HUGGINGFACE_HUB_API_KEY = "hf-secret";
    configUpsert.mockRejectedValueOnce(new Error("deadlock"));

    const result = await bootstrapFreeTierLLMProviders();

    expect(result.configured).toEqual([AIProvider.HUGGINGFACE]);
  });

  it("без ключа шифрования бутстрап молчит, а не падает", async () => {
    // Остальной контур работает; коннекторы просто не поднимаются.
    encryptionConfigured.mockReturnValue(false);
    process.env.NVIDIA_NIM_API_KEY = "nv-secret";

    const result = await bootstrapFreeTierLLMProviders();

    expect(result.skipped).toBe("encryption-not-configured");
    expect(configUpsert).not.toHaveBeenCalled();
    expect(credentialUpsert).not.toHaveBeenCalled();
  });

  it("пустая строка в оверлее — это отсутствие ключа, а не ключ", async () => {
    process.env.POLLINATIONS_AI_API_KEY = "   ";

    const result = await bootstrapFreeTierLLMProviders();

    expect(result.configured).toHaveLength(0);
    expect(credentialUpsert).not.toHaveBeenCalled();
  });
});
