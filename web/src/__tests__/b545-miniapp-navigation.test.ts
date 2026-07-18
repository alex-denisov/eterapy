import { isMiniAppInternalPath, miniAppLoginPath, miniAppProductPath, toMiniAppPath } from "@/lib/miniapp/navigation";
import fs from "node:fs";
import path from "node:path";

describe("B545 — complete Mini App navigation contract", () => {
  it.each([
    ["/checkin?dialogueId=d1", "/miniapp/checkin?dialogueId=d1"],
    ["/products/reframe?dialogueId=d1", "/miniapp/products/reframe?dialogueId=d1"],
    ["/products/chat?start=1", "/miniapp/products/chat?start=1"],
    ["/pricing#plus", "/miniapp/packages#plus"],
    ["/practitioners/alina?dialogueId=d1", "/miniapp/practitioners/alina?dialogueId=d1"],
    ["https://app.eterapy.com/cabinet/results/r1", "/miniapp/results/r1"],
    ["https://app.eterapy.com/cabinet/wallet", "/miniapp/profile/wallet"],
    ["https://app.eterapy.com/cabinet/bookings", "/miniapp/profile/bookings"],
    ["https://app.eterapy.com/cabinet/messages/m1", "/miniapp/materials/m1"],
    ["/cabinet/chat?dialogueId=d1", "/miniapp/products/chat?dialogueId=d1"],
    ["/cabinet/modalities/tarot", "/miniapp/products/tarot"],
    ["https://app.eterapy.com/cabinet/questions", "/miniapp/library"],
    ["/all-modalities/natal", "/miniapp/products/natal-chart"],
    ["/all-modalities/guide", "/miniapp/services"],
    ["/session/b1", "/miniapp/session/b1"],
    ["https://eterapy.com/checkin?question=test", "/miniapp/checkin?question=test"],
    ["/login?next=%2Fproducts%2Fpair", "/miniapp/account?mode=login&returnTo=%2Fminiapp%2Fproducts%2Fpair"],
    ["/register?intent=save-result", "/miniapp/account?intent=save-result&mode=register"],
  ])("maps %s to %s", (input, expected) => {
    expect(toMiniAppPath(input)).toBe(expected);
  });

  it("keeps deliberate non-product exits explicit", () => {
    expect(toMiniAppPath("/legal/ethics")).toBe("/legal/ethics");
    expect(toMiniAppPath("/api/auth/export-data")).toBe("/api/auth/export-data");
    expect(toMiniAppPath("mailto:support@eterapy.com")).toBe("mailto:support@eterapy.com");
    expect(toMiniAppPath("https://payments.example/confirm")).toBe("https://payments.example/confirm");
  });

  it("builds product routes inside the shell", () => {
    expect(miniAppProductPath("reframe")).toBe("/miniapp/products/reframe");
    expect(miniAppProductPath("chat-session")).toBe("/miniapp/products/chat");
    expect(isMiniAppInternalPath(miniAppProductPath("pair"))).toBe(true);
    expect(miniAppLoginPath("/miniapp/products/pair?invite=one")).toBe(
      "/miniapp/account?mode=login&returnTo=%2Fminiapp%2Fproducts%2Fpair%3Finvite%3Done",
    );
    expect(miniAppLoginPath("/products/pair")).toBeNull();
  });

  it("keeps video-session completion inside the Mini App shell", () => {
    const miniappSession = fs.readFileSync(path.join(process.cwd(), "src/components/miniapp/session-screen.tsx"), "utf8");
    const videoRoom = fs.readFileSync(path.join(process.cwd(), "src/components/video/video-room.tsx"), "utf8");

    expect(miniappSession).toContain('exitHref="/miniapp/profile/bookings"');
    expect(videoRoom).toContain("router.push(exitHref)");
  });
});
