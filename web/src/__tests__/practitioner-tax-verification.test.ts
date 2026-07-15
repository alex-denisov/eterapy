import {
  expectedInnLength,
  isValidInnChecksum,
  validateInn,
  TAX_STATUS_LABELS,
} from "@/lib/practitioner-tax-verification";
import { lookupTaxIdentity } from "@/lib/practitioner-tax-verification-provider";
import { resetAuthRateLimitForTests } from "@/lib/auth-rate-limit";

// B466/B483 — «Налоговый статус»: ИНН обязателен, 12 цифр (самозанятый/ИП) /
// 10 (юр. лицо), только цифры, контрольные суммы ФНС.

describe("B483 ИНН validation", () => {
  it("expects 12 digits for самозанятый/ИП and 10 for юр. лицо", () => {
    expect(expectedInnLength("SELF_EMPLOYED")).toBe(12);
    expect(expectedInnLength("INDIVIDUAL_ENTREPRENEUR")).toBe(12);
    expect(expectedInnLength("LEGAL_ENTITY")).toBe(10);
  });

  it("accepts valid checksums (known-good ИНН)", () => {
    // Публично известные валидные примеры: 10-значный (Сбербанк) и
    // 12-значный (пример из спецификации алгоритма).
    expect(isValidInnChecksum("7707083893")).toBe(true);
    expect(isValidInnChecksum("500100732259")).toBe(true);
  });

  it("rejects broken checksums and wrong shapes", () => {
    expect(isValidInnChecksum("7707083894")).toBe(false);
    expect(isValidInnChecksum("500100732258")).toBe(false);
    expect(isValidInnChecksum("12345")).toBe(false);
    expect(isValidInnChecksum("77070838ab")).toBe(false);
  });

  it("validates length per status with a human error", () => {
    const short = validateInn("7707083893", "SELF_EMPLOYED");
    expect(short.ok).toBe(false);
    expect(short.error).toContain("12 цифр");

    const legalWrong = validateInn("500100732259", "LEGAL_ENTITY");
    expect(legalWrong.ok).toBe(false);
    expect(legalWrong.error).toContain("10 цифр");
  });

  it("rejects non-digits and normalizes whitespace", () => {
    expect(validateInn("50010о732259", "SELF_EMPLOYED").ok).toBe(false);
    const spaced = validateInn("5001 0073 2259", "SELF_EMPLOYED");
    expect(spaced.ok).toBe(true);
    expect(spaced.inn).toBe("500100732259");
  });

  it("passes a fully valid ИНН", () => {
    expect(validateInn("500100732259", "INDIVIDUAL_ENTREPRENEUR")).toEqual({
      ok: true,
      inn: "500100732259",
    });
    expect(validateInn("7707083893", "LEGAL_ENTITY")).toEqual({ ok: true, inn: "7707083893" });
  });

  it("labels statuses in Russian", () => {
    expect(TAX_STATUS_LABELS.SELF_EMPLOYED).toBe("Самозанятый (НПД)");
    expect(TAX_STATUS_LABELS.INDIVIDUAL_ENTREPRENEUR).toBe("ИП");
    expect(TAX_STATUS_LABELS.LEGAL_ENTITY).toBe("Юр. лицо");
  });
});

describe("B483 tax-status flow (source contracts)", () => {
  const fs = jest.requireActual<typeof import("node:fs")>("node:fs");
  const path = jest.requireActual<typeof import("node:path")>("node:path");
  const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

  it("saves the status as VERIFIED only on the explicit confirm step", () => {
    const route = source("src/app/api/practitioner/tax-status/route.ts");
    expect(route).toContain('body?.step === "confirm"');
    expect(route).toContain('taxReviewStatus: "VERIFIED"');
    // lookup возвращает identity БЕЗ сохранения; сохранение — за confirm.
    expect(route.indexOf("identity")).toBeLessThan(route.indexOf("tx.practitioner.update"));
    expect(route).toContain("payoutDetails.update");
  });

  it("keeps the confirm sheet «Это действительно Вы?» in the form", () => {
    const form = source("src/app/cabinet/practitioner/finance/tax-status/tax-status-form.tsx");
    expect(form).toContain("Это действительно Вы?");
    expect(form).toContain("Да, это я — подтвердить");
    expect(form).toContain("Это не я");
  });

  it("uses an explicit provider switch that cannot silently fake ФНС", () => {
    const provider = source("src/lib/practitioner-tax-verification-provider.ts");
    expect(provider).toContain("TAX_VERIFICATION_PROVIDER");
    expect(provider).toContain("statusnpd.nalog.ru/api/v1/tracker/taxpayer_status");
    expect(provider).toContain("FNS EGRUL/EGRIP subscriber access is not configured");
  });
});

describe("B483 official FNS NPD provider", () => {
  const originalProvider = process.env.TAX_VERIFICATION_PROVIDER;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.TAX_VERIFICATION_PROVIDER = "fns";
    resetAuthRateLimitForTests();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    if (originalProvider === undefined) delete process.env.TAX_VERIFICATION_PROVIDER;
    else process.env.TAX_VERIFICATION_PROVIDER = originalProvider;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("posts INN and date to the public NPD status endpoint", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: true, message: "registered" }),
    });

    await expect(lookupTaxIdentity({
      inn: "500100732259",
      status: "SELF_EMPLOYED",
      fallbackDisplayName: "Тестовый практик",
    })).resolves.toMatchObject({ active: true, source: "fns-npd" });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://statusnpd.nalog.ru/api/v1/tracker/taxpayer_status",
      expect.objectContaining({
        method: "POST",
        body: expect.stringMatching(/"inn":"500100732259".*"requestDate":"\d{4}-\d{2}-\d{2}"/),
      }),
    );
  });

  it("returns inactive when FNS does not confirm NPD", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: false, message: "not registered" }),
    });
    await expect(lookupTaxIdentity({
      inn: "500100732259",
      status: "SELF_EMPLOYED",
      fallbackDisplayName: "Тестовый практик",
    })).resolves.toMatchObject({ active: false, source: "fns-npd" });
  });

  it("fails closed for IP and legal entities without registry access", async () => {
    await expect(lookupTaxIdentity({
      inn: "500100732259",
      status: "INDIVIDUAL_ENTREPRENEUR",
      fallbackDisplayName: "Тестовый практик",
    })).rejects.toThrow("subscriber access is not configured");
  });

  it("fails closed when the provider is explicitly disabled", async () => {
    process.env.TAX_VERIFICATION_PROVIDER = "disabled";
    await expect(lookupTaxIdentity({
      inn: "500100732259",
      status: "SELF_EMPLOYED",
      fallbackDisplayName: "Тестовый практик",
    })).rejects.toThrow("INN ownership is verified");
  });

  it("enforces the official two-request-per-minute source-IP budget", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: true, message: "registered" }),
    });
    const query = {
      inn: "500100732259",
      status: "SELF_EMPLOYED" as const,
      fallbackDisplayName: "Тестовый практик",
    };

    await lookupTaxIdentity(query);
    await lookupTaxIdentity(query);
    await expect(lookupTaxIdentity(query)).rejects.toThrow("rate is temporarily exhausted");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
