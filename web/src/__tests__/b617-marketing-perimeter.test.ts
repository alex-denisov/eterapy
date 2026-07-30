/**
 * B617 — законный периметр SMM-агента.
 *
 * Проверяем не формулировки, а исполнимость запрета: действие вне периметра
 * должно отклоняться кодом, а не оставаться договорённостью в тикете.
 */

import {
  ALLOWED_MARKETING_ACTIONS,
  MarketingPerimeterError,
  actionForPublication,
  assertWithinPerimeter,
  isWithinPerimeter,
} from "@/lib/marketing/perimeter";
import { isCapacityError, MarketingCapacityError } from "@/lib/marketing/agent";

describe("B617 · законный периметр площадок", () => {
  it("комментарий под чужим постом вне периметра на любой площадке", () => {
    expect(isWithinPerimeter("THIRD_PARTY_COMMENT")).toBe(false);
    expect(ALLOWED_MARKETING_ACTIONS).not.toContain("THIRD_PARTY_COMMENT");
  });

  it("свои публикации и ответы на входящее разрешены", () => {
    expect(isWithinPerimeter("OWN_POST")).toBe(true);
    expect(isWithinPerimeter("REPLY_TO_OWN")).toBe(true);
    expect(isWithinPerimeter("REPLY_TO_MENTION")).toBe(true);
  });

  it("запрет исполняется исключением, а не молчаливым пропуском", () => {
    expect(() => assertWithinPerimeter("THIRD_PARTY_COMMENT", "vk"))
      .toThrow(MarketingPerimeterError);
    expect(() => assertWithinPerimeter("OWN_POST", "vk")).not.toThrow();
  });

  it("строка с целью-чужим постом опознаётся как действие вне периметра", () => {
    expect(actionForPublication({
      contentType: "COMMENT",
      engagementTargetId: "t3_abc",
    })).toBe("THIRD_PARTY_COMMENT");
  });

  it("ответ на входящее опознаётся как ответ в своём пространстве", () => {
    expect(actionForPublication({
      contentType: "COMMENT",
      engagementTargetId: null,
      inboundReplyToId: "comment-1",
    })).toBe("REPLY_TO_OWN");
  });

  it("собственный пост остаётся собственным постом", () => {
    expect(actionForPublication({ contentType: "POST" })).toBe("OWN_POST");
  });
});

describe("B617 · исчерпание ёмкости — не брак материала", () => {
  it("суточный потолок токенов опознаётся как нехватка ёмкости", () => {
    expect(isCapacityError(new Error("AI feature daily token budget exceeded"))).toBe(true);
  });

  it("квота и 429 провайдера опознаются так же", () => {
    expect(isCapacityError(new Error("HTTP 429 Too Many Requests"))).toBe(true);
    expect(isCapacityError(new Error("insufficient_quota"))).toBe(true);
  });

  it("собственный тип ошибки опознаётся напрямую", () => {
    expect(isCapacityError(new MarketingCapacityError("нет ёмкости"))).toBe(true);
  });

  it("содержательный отказ редактора нехваткой ёмкости не считается", () => {
    expect(isCapacityError(new Error("Reviewer rejected: unverifiable claim"))).toBe(false);
  });
});
