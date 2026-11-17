import { replyNotesWithCta } from "@/lib/marketing/agent";
import { threadsDayLineup } from "@/lib/marketing/threads-lineup";
import { FOUNDER_PRODUCT_FORMAT } from "@/lib/marketing/threads-useful-formats";

jest.mock("@/lib/db", () => ({ db: {} }));

test("founder slot includes a measurable free-entry CTA despite an incorrect model target", () => {
  const day = Math.floor(Date.parse("2026-11-17T00:00:00Z") / 86_400_000);
  const slot = threadsDayLineup(day, { series: { day: 3, total: 30, isAnnouncement: false } })
    .find((entry) => entry.format === FOUNDER_PRODUCT_FORMAT);
  expect(slot?.cta).toBe(true);
  const result = replyNotesWithCta(
    { text: "Я сооснователь ETerapy", replyText: "Сначала отделите факты от догадок.\n\nМожно описать свою ситуацию.", ctaTarget: "tarot" },
    { format: slot?.format.label, formatCta: slot?.cta, formatCtaPlace: slot?.ctaPlace },
  );
  expect(result.ctaLine).toContain("/checkin?");
  expect(result.ctaLine).toContain("бесплатно, без регистрации");
  expect(result.ctaLine).toContain("utm_source=threads");
  expect(result.replyText).not.toContain("eterapy.com");
});
