/**
 * B423 — Robokassa protocol layer.
 *
 * The expected digests below were produced INDEPENDENTLY with `openssl dgst
 * -sha256` over the documented signature strings, so a bug in our own hashing
 * helper cannot make these tests pass vacuously.
 */
import {
  buildPaymentSignature,
  buildPaymentUrl,
  buildReceipt,
  encodeReceipt,
  formatOutSum,
  parseCallback,
  parseOutSumToKopecks,
  resultAcknowledgement,
  verifyResultSignature,
  verifySuccessSignature,
  type RobokassaConfig,
} from "@/lib/payments/robokassa";

const config: RobokassaConfig = {
  merchantLogin: "eterapy",
  password1: "P1",
  password2: "P2",
  hashAlgorithm: "SHA256",
  isTest: false,
};

// openssl: printf 'eterapy:790.00:1001:P1' | openssl dgst -sha256
const SIG_PLAIN = "C386E006744FEAE92D7B3E6D19F939AFAF5BBE6D1082BE984C38C489AB19AA8B";
// openssl: printf 'eterapy:790.00:1001:P1:Shp_kind=product:Shp_user=u1' | ...
const SIG_WITH_SHP = "39916A4EB93736F3150805FBB47ADE5783A6C8F975BBF05D65A0CCC678ADDF80";
// openssl: printf '790.00:1001:P2' | ...
const SIG_RESULT = "761A72042C89B50FAF7C15F79021A53C3437B72FC0BBEA2E48934E583F6CFEDD";
// openssl: printf '790.00:1001:P1' | ...
const SIG_SUCCESS = "6A834276271FF52C464B8C667B1232698F01920261E0DC0CBB87CA8DDAB37BC9";
// openssl: printf '790.00:1001:P2:Shp_kind=product' | ...
const SIG_RESULT_WITH_SHP = "B5384D8BBF1625522F67BFDD198C1DCE77DEEEA9097D7A6CD1BD84F184133409";
// B570: чек входит в подпись СЫРЫМ json, не url-кодированным (проверено на
// боевом магазине — с кодированным Robokassa отвечает ошибкой 29).
// openssl: printf 'eterapy:1390.00:1002:{"sno":"usn_income","items":[{"name":"Пакет 10 разборов","quantity":1,"sum":1390,"payment_method":"full_payment","payment_object":"service","tax":"none"}]}:P1' | openssl dgst -sha256
const SIG_WITH_RECEIPT = "40804315A25306CC12D0A986F1327499CC5F599B98215F014657A2BDBDC55B11";

describe("amount formatting", () => {
  it("renders kopecks as a two-decimal OutSum", () => {
    expect(formatOutSum(79000)).toBe("790.00");
    expect(formatOutSum(1)).toBe("0.01");
  });

  it("rejects non-integer and non-positive amounts", () => {
    expect(() => formatOutSum(0)).toThrow();
    expect(() => formatOutSum(-100)).toThrow();
    expect(() => formatOutSum(10.5)).toThrow();
  });

  it("parses the loose OutSum forms Robokassa may echo back", () => {
    expect(parseOutSumToKopecks("790")).toBe(79000);
    expect(parseOutSumToKopecks("790.0")).toBe(79000);
    expect(parseOutSumToKopecks("790.00")).toBe(79000);
    expect(parseOutSumToKopecks("790,50")).toBe(79050);
    expect(parseOutSumToKopecks("abc")).toBeNull();
    expect(parseOutSumToKopecks("790.005")).toBeNull();
  });
});

describe("request signature", () => {
  it("matches the documented MerchantLogin:OutSum:InvId:Password#1 form", () => {
    expect(buildPaymentSignature({ config, outSum: "790.00", invId: 1001 })).toBe(SIG_PLAIN);
  });

  it("appends Shp_ params after the password, sorted alphabetically", () => {
    // Insertion order is deliberately reversed — sorting must not depend on it.
    const signature = buildPaymentSignature({
      config,
      outSum: "790.00",
      invId: 1001,
      shp: { Shp_user: "u1", Shp_kind: "product" },
    });
    expect(signature).toBe(SIG_WITH_SHP);
  });

  it("puts the URL-ENCODED receipt into the signature, not the raw JSON", () => {
    const receipt = {
      taxSystem: "usn_income" as const,
      items: [
        {
          name: "Пакет 10 разборов",
          quantity: 1,
          sumKopecks: 139000,
          tax: "none" as const,
          paymentObject: "service" as const,
          paymentMethod: "full_payment" as const,
        },
      ],
    };
    // На провод чек уходит закодированным…
    const receiptJson = buildReceipt(receipt);
    expect(encodeReceipt(receiptJson)).toContain("%7B%22sno%22%3A%22usn_income%22");

    // …а в подпись — СЫРЫМ. Кодировки намеренно разные, см. ниже.
    expect(
      buildPaymentSignature({ config, outSum: "1390.00", invId: 1002, receiptJson }),
    ).toBe(SIG_WITH_RECEIPT);
  });

  /**
   * B570, проверено вживую против боевого магазина 2026-07-22.
   *
   * Подпись собиралась из URL-КОДИРОВАННОГО чека, и Robokassa отвечала ошибкой
   * 29 на каждую ссылку с чеком — то есть на каждую настоящую покупку. Ссылка
   * без чека при тех же кредах принималась, поэтому дефект не был виден ни
   * тестам, ни проверке «а живые ли пароли».
   *
   * Замеры (магазин eterapy, боевая пара, SHA256):
   *   подпись=encoded, url=encoded → error 29
   *   подпись=RAW,     url=encoded → принято
   */
  it("подпись берёт СЫРОЙ json чека, а ссылка — закодированный", () => {
    const receipt = {
      taxSystem: "usn_income" as const,
      items: [{
        name: "Разбор ситуации",
        quantity: 1,
        sumKopecks: 10000,
        tax: "none" as const,
        paymentObject: "service" as const,
        paymentMethod: "full_payment" as const,
      }],
    };
    const receiptJson = buildReceipt(receipt);
    const encoded = encodeReceipt(receiptJson);

    // Подписи от сырого и от закодированного чека обязаны РАЗЛИЧАТЬСЯ —
    // иначе регрессия проедет незамеченной.
    expect(buildPaymentSignature({ config, outSum: "100.00", invId: 7, receiptJson }))
      .not.toBe(buildPaymentSignature({ config, outSum: "100.00", invId: 7, receiptJson: encoded }));

    const url = buildPaymentUrl({ config, amountKopecks: 10000, invId: 7, description: "x", receipt });
    // В ссылке — закодированный чек…
    expect(url).toContain(`Receipt=${encoded}`);
    // …а подпись в ней совпадает с подписью от сырого json.
    expect(url).toContain(
      `SignatureValue=${buildPaymentSignature({ config, outSum: "100.00", invId: 7, receiptJson })}`,
    );
  });
});

describe("callback signature verification", () => {
  it("accepts a ResultURL signature made with password #2", () => {
    expect(
      verifyResultSignature({ config, outSum: "790.00", invId: 1001, signatureValue: SIG_RESULT }),
    ).toBe(true);
  });

  it("accepts a lowercase digest — Robokassa varies the casing", () => {
    expect(
      verifyResultSignature({
        config,
        outSum: "790.00",
        invId: 1001,
        signatureValue: SIG_RESULT.toLowerCase(),
      }),
    ).toBe(true);
  });

  it("rejects a ResultURL signature made with password #1", () => {
    expect(
      verifyResultSignature({ config, outSum: "790.00", invId: 1001, signatureValue: SIG_SUCCESS }),
    ).toBe(false);
  });

  it("rejects a tampered amount", () => {
    expect(
      verifyResultSignature({ config, outSum: "1.00", invId: 1001, signatureValue: SIG_RESULT }),
    ).toBe(false);
  });

  it("rejects a tampered InvId", () => {
    expect(
      verifyResultSignature({ config, outSum: "790.00", invId: 999, signatureValue: SIG_RESULT }),
    ).toBe(false);
  });

  it("verifies SuccessURL against password #1", () => {
    expect(
      verifySuccessSignature({ config, outSum: "790.00", invId: 1001, signatureValue: SIG_SUCCESS }),
    ).toBe(true);
    expect(
      verifySuccessSignature({ config, outSum: "790.00", invId: 1001, signatureValue: SIG_RESULT }),
    ).toBe(false);
  });

  it("acknowledges the callback in the OK{InvId} form Robokassa expects", () => {
    expect(resultAcknowledgement(1001)).toBe("OK1001");
  });
});

describe("callback parsing", () => {
  it("reads the documented fields and keeps Shp_ casing", () => {
    const parsed = parseCallback(
      new URLSearchParams({
        OutSum: "790.00",
        InvId: "1001",
        SignatureValue: SIG_RESULT,
        Fee: "23.70",
        EMail: "client@test.eterapy.com",
        PaymentMethod: "BankCard",
        Shp_kind: "product",
      }),
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.invId).toBe(1001);
    expect(parsed?.fee).toBe("23.70");
    expect(parsed?.email).toBe("client@test.eterapy.com");
    expect(parsed?.shp).toEqual({ Shp_kind: "product" });
  });

  it("is case-insensitive about parameter names (GET vs POST differ)", () => {
    const parsed = parseCallback(
      new URLSearchParams({ outSum: "790.00", invid: "1001", signaturevalue: SIG_RESULT }),
    );
    expect(parsed?.invId).toBe(1001);
  });

  it("rejects malformed or missing fields instead of coercing them", () => {
    expect(parseCallback(new URLSearchParams({ OutSum: "790.00", InvId: "1001" }))).toBeNull();
    expect(
      parseCallback(new URLSearchParams({ OutSum: "790.00", InvId: "abc", SignatureValue: "x" })),
    ).toBeNull();
    expect(
      parseCallback(new URLSearchParams({ OutSum: "nope", InvId: "1001", SignatureValue: "x" })),
    ).toBeNull();
    expect(
      parseCallback(new URLSearchParams({ OutSum: "790.00", InvId: "0", SignatureValue: "x" })),
    ).toBeNull();
  });

  it("verifies a callback whose Shp_ params came back with the payment", () => {
    // Robokassa echoes the Shp_* we sent and includes them in the password-#2
    // signature, so parsing and verification must agree on them.
    const url = new URL(
      buildPaymentUrl({
        config,
        amountKopecks: 79000,
        invId: 1001,
        description: "Разбор",
        shp: { Shp_kind: "product" },
      }),
    );
    const parsed = parseCallback(
      new URLSearchParams({
        OutSum: url.searchParams.get("OutSum")!,
        InvId: url.searchParams.get("InvId")!,
        Shp_kind: url.searchParams.get("Shp_kind")!,
        // openssl: printf '790.00:1001:P2:Shp_kind=product' | openssl dgst -sha256
        SignatureValue: SIG_RESULT_WITH_SHP,
      }),
    );
    expect(parsed).not.toBeNull();
    expect(
      verifyResultSignature({
        config,
        outSum: parsed!.outSum,
        invId: parsed!.invId,
        signatureValue: parsed!.signatureValue,
        shp: parsed!.shp,
      }),
    ).toBe(true);
  });
});

describe("payment URL", () => {
  it("carries the protocol parameters and the signature", () => {
    const url = new URL(
      buildPaymentUrl({ config, amountKopecks: 79000, invId: 1001, description: "Разбор" }),
    );
    expect(url.origin + url.pathname).toBe("https://auth.robokassa.ru/Merchant/Index.aspx");
    expect(url.searchParams.get("MerchantLogin")).toBe("eterapy");
    expect(url.searchParams.get("OutSum")).toBe("790.00");
    expect(url.searchParams.get("InvId")).toBe("1001");
    expect(url.searchParams.get("SignatureValue")).toBe(SIG_PLAIN);
    expect(url.searchParams.get("IsTest")).toBeNull();
  });

  it("flags test mode so production passwords are never used there", () => {
    const url = new URL(
      buildPaymentUrl({
        config: { ...config, isTest: true },
        amountKopecks: 79000,
        invId: 1001,
        description: "Разбор",
      }),
    );
    expect(url.searchParams.get("IsTest")).toBe("1");
  });

  it("does not double-encode the receipt (that would break the signature)", () => {
    const url = buildPaymentUrl({
      config,
      amountKopecks: 139000,
      invId: 1002,
      description: "Пакет",
      receipt: {
        taxSystem: "usn_income",
        items: [
          {
            name: "Пакет 10 разборов",
            quantity: 1,
            sumKopecks: 139000,
            tax: "none",
            paymentObject: "service",
            paymentMethod: "full_payment",
          },
        ],
      },
    });
    expect(url).toContain(`SignatureValue=${SIG_WITH_RECEIPT}`);
    expect(url).not.toContain("%257B"); // '%7B' encoded twice

    const receiptRaw = url.slice(url.indexOf("&Receipt=") + "&Receipt=".length);
    expect(JSON.parse(decodeURIComponent(receiptRaw)).sno).toBe("usn_income");
  });

  it("truncates the payer-visible description to the protocol limit", () => {
    const url = new URL(
      buildPaymentUrl({ config, amountKopecks: 79000, invId: 1001, description: "д".repeat(200) }),
    );
    expect(url.searchParams.get("Description")).toHaveLength(100);
  });

  it("rejects an invalid InvId — it is our idempotency key", () => {
    expect(() =>
      buildPaymentUrl({ config, amountKopecks: 79000, invId: 0, description: "x" }),
    ).toThrow(/InvId/);
    expect(() =>
      buildPaymentUrl({ config, amountKopecks: 79000, invId: 1.5, description: "x" }),
    ).toThrow(/InvId/);
  });

  it("rejects Shp_ names Robokassa would reject", () => {
    expect(() =>
      buildPaymentUrl({
        config,
        amountKopecks: 79000,
        invId: 1001,
        description: "x",
        shp: { "Shp_bad-name": "1" },
      }),
    ).toThrow(/Shp_/);
    expect(() =>
      buildPaymentUrl({
        config,
        amountKopecks: 79000,
        invId: 1001,
        description: "x",
        shp: { userId: "1" },
      }),
    ).toThrow(/Shp_/);
  });
});

describe("receipt", () => {
  it("bills without VAT on УСН and rounds sums to rubles", () => {
    const receipt = JSON.parse(
      buildReceipt({
        taxSystem: "usn_income",
        items: [
          {
            name: "Разбор",
            quantity: 1,
            sumKopecks: 79000,
            tax: "none",
            paymentObject: "service",
            paymentMethod: "full_payment",
          },
        ],
      }),
    );
    expect(receipt.sno).toBe("usn_income");
    expect(receipt.items[0]).toEqual({
      name: "Разбор",
      quantity: 1,
      sum: 790,
      payment_method: "full_payment",
      payment_object: "service",
      tax: "none",
    });
  });

  it("truncates item names the fiscal drive would reject", () => {
    const receipt = JSON.parse(
      buildReceipt({
        taxSystem: "usn_income",
        items: [
          {
            name: "т".repeat(300),
            quantity: 1,
            sumKopecks: 100,
            tax: "none",
            paymentObject: "service",
            paymentMethod: "full_payment",
          },
        ],
      }),
    );
    expect(receipt.items[0].name).toHaveLength(128);
  });

  it("refuses to build an empty receipt", () => {
    expect(() => buildReceipt({ taxSystem: "usn_income", items: [] })).toThrow();
  });
});
