import { sessionSttTestables } from "@/lib/session-stt";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("Yandex SpeechKit server STT", () => {
  it("starts and polls an async OggOpus recognition operation", async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ id: "operation-1", done: false }))
      .mockResolvedValueOnce(jsonResponse({
        id: "operation-1",
        done: true,
        response: {
          chunks: [
            { channelTag: "1", alternatives: [{ text: "Добрый день, расскажите о запросе." }] },
            { channelTag: "2", alternatives: [{ text: "Мне нужно принять важное решение." }] },
          ],
        },
      })) as unknown as typeof fetch;

    const result = await sessionSttTestables.recognizeObject(
      "https://storage.yandexcloud.net/eterapy-stt/session-stt/audio.ogg",
      "api-key",
      {
        fetchImpl,
        sleep: async () => undefined,
        pollMs: 0,
        timeoutMs: 1_000,
      },
    );

    expect(result.transcript).toBe([
      "Канал 1: Добрый день, расскажите о запросе.",
      "Канал 2: Мне нужно принять важное решение.",
    ].join("\n"));
    expect(result.operationId).toBe("operation-1");
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("longRunningRecognize"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"audioEncoding":"OGG_OPUS"'),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/operations/operation-1"),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("rejects foreign buckets and paths in internal object locators", () => {
    expect(() => sessionSttTestables.remoteAudioObject(
      "yandex-s3://foreign-bucket/session-stt/audio.ogg",
      "eterapy-stt",
    )).toThrow("Invalid Yandex Object Storage");
    expect(() => sessionSttTestables.remoteAudioObject(
      "yandex-s3://eterapy-stt/other/audio.ogg",
      "eterapy-stt",
    )).toThrow("Invalid Yandex Object Storage");
  });
});
