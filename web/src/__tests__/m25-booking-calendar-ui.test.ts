import { readFileSync } from "fs";
import { join } from "path";

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/**
 * B353 / Интерфейс 10 — UI календаря/бронирования. Доступные дни видны (тёплая
 * подсветка), предложенное время не «белое на белом», статичный заголовок
 * «X минут · онлайн / цена» (не обновлявшийся при переключении формата) убран.
 */
describe("B353 — booking calendar UI contrast", () => {
  it("slot-picker uses Soft Clarity tokens (no invisible old-theme colors)", () => {
    const picker = source("src/app/practitioners/[slug]/slot-picker.tsx");
    // Calendar available days + selected/time chips use soft ink/apricot/bordeaux.
    expect(picker).toContain("var(--soft-apricot)");
    expect(picker).toContain("var(--soft-bordeaux)");
    expect(picker).toContain("text-[var(--soft-ink)]");
    // The washed-out old-theme tokens that rendered gray/white-on-white are gone.
    expect(picker).not.toContain("text-muted-foreground");
    expect(picker).not.toContain("text-foreground");
  });

  it("booking card no longer shows a static duration/price header above the toggle", () => {
    const page = source("src/app/practitioners/[slug]/page.tsx");
    // The format toggle inside SlotPicker is the single source of duration · price.
    expect(page).not.toContain("минут · онлайн");
  });
});
