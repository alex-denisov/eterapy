import { publishThreadsContainer } from "@/lib/marketing/threads-container";

const json = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as Response;

describe("publishThreadsContainer", () => {
  const sleep = jest.fn(async () => undefined);
  const base = { userId: "u1", token: "t", creationId: "c1", sleep };

  beforeEach(() => {
    sleep.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("ждёт FINISHED и только потом выпускает", async () => {
    const calls: string[] = [];
    jest.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      calls.push(url.includes("threads_publish") ? "publish" : "status");
      if (url.includes("threads_publish")) return json({ id: "p1" });
      return json({ status: calls.filter((c) => c === "status").length < 2 ? "IN_PROGRESS" : "FINISHED" });
    });
    await expect(publishThreadsContainer(base)).resolves.toEqual({ id: "p1" });
    expect(calls).toEqual(["status", "status", "publish"]);
  });

  it("повторяет выпуск, если Meta ответила «не существует» после создания", async () => {
    let publishCalls = 0;
    jest.spyOn(global, "fetch").mockImplementation(async (input) => {
      if (!String(input).includes("threads_publish")) return json({ status: "FINISHED" });
      publishCalls += 1;
      return publishCalls < 3
        ? json({ error: { message: "The requested resource does not exist" } }, false, 400)
        : json({ id: "p2" });
    });
    await expect(publishThreadsContainer(base)).resolves.toEqual({ id: "p2" });
    expect(publishCalls).toBe(3);
  });

  it("не повторяет настоящий отказ", async () => {
    let publishCalls = 0;
    jest.spyOn(global, "fetch").mockImplementation(async (input) => {
      if (!String(input).includes("threads_publish")) return json({ status: "FINISHED" });
      publishCalls += 1;
      return json({ error: { message: "Invalid OAuth access token" } }, false, 401);
    });
    await expect(publishThreadsContainer(base)).rejects.toThrow("Invalid OAuth access token");
    expect(publishCalls).toBe(1);
  });

  it("ERROR контейнера — сразу отказ без выпуска", async () => {
    const spy = jest.spyOn(global, "fetch").mockResolvedValue(json({ status: "ERROR", error_message: "bad" }));
    await expect(publishThreadsContainer(base)).rejects.toThrow("ERROR");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
