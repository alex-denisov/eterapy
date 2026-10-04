import { interpretOwnerMessage } from "@/lib/marketing/orchestrator-dialogue";
import { withBacklinkStatus } from "@/lib/seo/backlink-targets";

describe("B750 interpretOwnerMessage", () => {
  it("профили созданы и наполнены -> backlink_done для обоих", () => {
    const r = interpretOwnerMessage("Профили в Google Business и Яндекс.Бизнес уже созданы и наполнены");
    expect(r).toMatchObject({ kind: "backlink_done", status: "done" });
    if (r.kind === "backlink_done") expect([...r.targetIds].sort()).toEqual(["google-business", "yandex-business"]);
  });
  it("яндекс бизнес готов", () => {
    expect(interpretOwnerMessage("яндекс бизнес готов")).toMatchObject({ kind: "backlink_done", targetIds: ["yandex-business"], status: "done" });
  });
  it("гугл бизнес не нужен -> skipped", () => {
    expect(interpretOwnerMessage("гугл бизнес не нужен")).toMatchObject({ kind: "backlink_done", targetIds: ["google-business"], status: "skipped" });
  });
  it("не создан -> pending", () => {
    expect(interpretOwnerMessage("Google Business пока не создан")).toMatchObject({ status: "pending" });
  });
  it("hold / resume / report_now", () => {
    expect(interpretOwnerMessage("стоп").kind).toBe("hold");
    expect(interpretOwnerMessage("Не вноси правки").kind).toBe("hold");
    expect(interpretOwnerMessage("продолжай").kind).toBe("resume");
    expect(interpretOwnerMessage("возобнови").kind).toBe("resume");
    expect(interpretOwnerMessage("отчёт").kind).toBe("report_now");
    expect(interpretOwnerMessage("что нового?").kind).toBe("report_now");
  });
  it("свободный факт — note, длинный текст с «отчёт» не запускает отчёт", () => {
    expect(interpretOwnerMessage("пост в threads выходит без второго поста").kind).toBe("note");
    const long = "в отчёте написано про threads, но на самом деле второй пост выходит позже и это нормально для нас";
    expect(interpretOwnerMessage(long).kind).toBe("note");
    expect(interpretOwnerMessage("удали базу").kind).toBe("note");
  });
  it("withBacklinkStatus чистая", () => {
    const base = {};
    const next = withBacklinkStatus(base, "yandex-business", "done", "владелец", new Date("2026-10-05T00:00:00Z"));
    expect(base).toEqual({});
    expect(next["yandex-business"]).toMatchObject({ status: "done", note: "владелец", updatedAt: "2026-10-05T00:00:00.000Z" });
  });
});
