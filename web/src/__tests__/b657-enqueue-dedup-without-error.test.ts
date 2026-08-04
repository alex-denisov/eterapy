/**
 * B657 / INC-099 — идемпотентная постановка перестала писать ошибку в журнал БД.
 *
 * Дедупликация работала и раньше, но ЕДИНСТВЕННЫМ путём к ней был INSERT,
 * упавший на уникальном индексе. Для приложения это был штатный исход, а для
 * Postgres — ошибка: он писал в свой журнал строку ERROR и следом полный текст
 * STATEMENT вместе с payload. Планировщик повторяет одни и те же ключи каждый
 * тик, поэтому на eterapy-1 журнал рос примерно на 60 МБ в сутки и держал
 * 400 МБ на диске, где нехватки места хватает, чтобы уронить выкатку.
 *
 * Прогон держит границу: известный ключ не доходит до INSERT вовсе, а гонка
 * (ключ появился между чтением и вставкой) по-прежнему разрешается через
 * P2002 — она редкая, и в журнале ей место.
 */

import { Prisma, JobStatus, type Job } from "@prisma/client";
import { enqueueJob } from "@/lib/job-queue";
import db from "@/lib/db";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    job: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
    },
  },
}));

const mockDb = db as unknown as {
  job: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findFirstOrThrow: jest.Mock;
  };
};

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    queue: "default",
    type: "cron.tick",
    status: JobStatus.PENDING,
    priority: 0,
    payload: {},
    result: null,
    error: null,
    attempts: 0,
    maxAttempts: 3,
    runAfter: new Date("2026-08-04T00:00:00.000Z"),
    lockedAt: null,
    lockedBy: null,
    startedAt: null,
    finishedAt: null,
    idempotencyKey: "cron:2026-08-04T00:00",
    createdAt: new Date("2026-08-04T00:00:00.000Z"),
    updatedAt: new Date("2026-08-04T00:00:00.000Z"),
    ...overrides,
  };
}

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("B657 · известный идемпотентный ключ не доходит до INSERT", () => {
  it("возвращает существующую работу, ни разу не вызвав create", async () => {
    const existing = job();
    mockDb.job.findFirst.mockResolvedValue(existing);

    const result = await enqueueJob({
      type: "cron.tick",
      payload: {},
      idempotencyKey: "cron:2026-08-04T00:00",
    });

    expect(result).toBe(existing);
    // Главное утверждение тикета: INSERT'а нет — значит нет и ERROR в журнале БД.
    expect(mockDb.job.create).not.toHaveBeenCalled();
  });

  it("новый ключ по-прежнему вставляется", async () => {
    mockDb.job.findFirst.mockResolvedValue(null);
    const created = job({ id: "job-2" });
    mockDb.job.create.mockResolvedValue(created);

    const result = await enqueueJob({
      type: "cron.tick",
      payload: {},
      idempotencyKey: "cron:2026-08-04T01:00",
    });

    expect(result).toBe(created);
    expect(mockDb.job.create).toHaveBeenCalledTimes(1);
  });

  it("постановка без ключа не делает лишнего чтения", async () => {
    const created = job({ id: "job-3", idempotencyKey: null });
    mockDb.job.create.mockResolvedValue(created);

    await enqueueJob({ type: "cron.tick", payload: {} });

    expect(mockDb.job.findFirst).not.toHaveBeenCalled();
    expect(mockDb.job.create).toHaveBeenCalledTimes(1);
  });
});

describe("B657 · гонка всё ещё разрешается", () => {
  it("ключ, появившийся между чтением и вставкой, возвращает чужую работу", async () => {
    mockDb.job.findFirst.mockResolvedValue(null);
    mockDb.job.create.mockRejectedValue(uniqueViolation());
    const winner = job({ id: "job-winner" });
    mockDb.job.findFirstOrThrow.mockResolvedValue(winner);

    const result = await enqueueJob({
      type: "cron.tick",
      payload: {},
      idempotencyKey: "cron:2026-08-04T02:00",
    });

    expect(result).toBe(winner);
    expect(mockDb.job.create).toHaveBeenCalledTimes(1);
  });
});
