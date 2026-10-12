/** B760 — возврат к услуге, скорость регистраций с IP, текст про подарок. */
import { authLink, authReturnQuery, cameFromService, getSafeRedirectPath, readAuthReturn } from "@/lib/auth-return";
import { scoreRegistration, REGISTRATION_BLOCK_THRESHOLD } from "@/lib/registration-antifraud";
import { WELCOME_CREDIT_AMOUNT } from "@/lib/welcome-credits";
import { WELCOME_CREDIT_AMOUNT as COPY_AMOUNT } from "@/lib/welcome-credit-copy";

describe("контекст возврата", () => {
  it("пропускает только локальные пути", () => {
    expect(getSafeRedirectPath("/products/tarot")).toBe("/products/tarot");
    expect(getSafeRedirectPath("//evil.com")).toBeNull();
    expect(getSafeRedirectPath("https://evil.com")).toBeNull();
    expect(getSafeRedirectPath("/a\\b")).toBeNull();
  });

  it("ссылка между входом и регистрацией несёт весь контекст", () => {
    const ctx = readAuthReturn(new URLSearchParams("next=/products/tarot&intent=buy-product&productKey=tarot"));
    expect(authLink("/register", ctx)).toBe("/register?next=%2Fproducts%2Ftarot&intent=buy-product&productKey=tarot");
    expect(authLink("/login", ctx, { email: "a@b.ru" })).toContain("email=a%40b.ru");
    expect(cameFromService(ctx)).toBe(true);
  });

  it("мусор отбрасывается, пустой контекст — пустая строка", () => {
    const ctx = readAuthReturn(new URLSearchParams("next=//x&intent=<script>"));
    expect(ctx).toEqual({ next: null, intent: null, productKey: null });
    expect(authReturnQuery(ctx)).toBe("");
    expect(cameFromService(ctx)).toBe(false);
  });
});

describe("скорость регистраций с IP", () => {
  const clean = { name: "Анна", email: "anna@example.ru" };
  it("4-я и 10-я регистрации с чистым профилем проходят", () => {
    expect(scoreRegistration({ ...clean, ipRegistrations24h: 4 }).block).toBe(false);
    expect(scoreRegistration({ ...clean, ipRegistrations24h: 10 }).block).toBe(false);
  });
  it("скорость плюс другие сигналы блокирует", () => {
    const risky = scoreRegistration({ name: "mNXYgzyDaOTx", email: "a.b.c.d@gmail.com", ipRegistrations24h: 12 });
    expect(risky.score).toBeGreaterThanOrEqual(REGISTRATION_BLOCK_THRESHOLD);
    expect(risky.block).toBe(true);
  });
});

it("число подарочных баллов в текстах совпадает с начислением", () => {
  expect(COPY_AMOUNT).toBe(WELCOME_CREDIT_AMOUNT);
});

it("управляющие символы в next не дают открытый редирект", () => {
  expect(getSafeRedirectPath("/\n/evil.com")).toBeNull();
  expect(getSafeRedirectPath("/\t/evil.com")).toBeNull();
  expect(getSafeRedirectPath("/products/tarot?a=1")).toBe("/products/tarot?a=1");
});
