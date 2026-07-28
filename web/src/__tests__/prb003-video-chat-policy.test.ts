import {
  VIDEO_CHAT_RETENTION_MS,
  videoChatReadable,
  videoChatRetentionExpiresAt,
  videoChatWritable,
} from "@/lib/video-chat-policy";

describe("PRB-003 · жизненный цикл чата", () => {
  const endedAt = new Date("2026-07-28T10:00:00Z");

  it("запись разрешена только пока сессия ждёт или идёт", () => {
    expect(videoChatWritable({ status: "WAITING", endedAt: null })).toBe(true);
    expect(videoChatWritable({ status: "ACTIVE", endedAt: null })).toBe(true);
    expect(videoChatWritable({ status: "ENDED", endedAt })).toBe(false);
    expect(videoChatWritable({ status: "RECORDING", endedAt })).toBe(false);
  });

  it("чтение закрывается ровно через 24 часа", () => {
    const state = { status: "ENDED", endedAt };
    expect(videoChatRetentionExpiresAt(state)?.getTime())
      .toBe(endedAt.getTime() + VIDEO_CHAT_RETENTION_MS);
    expect(videoChatReadable(state, new Date("2026-07-29T09:59:59Z"))).toBe(true);
    expect(videoChatReadable(state, new Date("2026-07-29T10:00:00Z"))).toBe(false);
  });
});
