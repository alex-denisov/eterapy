import { readFileSync } from "fs";
import { join } from "path";
import {
  ensurePractitionerForUser,
  suspendPractitionerForUser,
} from "@/lib/practitioner-provisioning";

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/**
 * B347 / Механика 9 — полноценный механизм «создания» практика.
 * Перевод роли в практика (или создание пользователя-практика) обязан создать
 * запись Practitioner со статусом ACTIVE, чтобы у него была публичная страница
 * и он участвовал в поиске/рекомендациях.
 */
describe("B347 — ensurePractitionerForUser", () => {
  type FakeRow = { id: string; slug: string; status: string; userId: string } | null;

  function makeTx(initial: FakeRow) {
    let row: FakeRow = initial;
    const created: Array<Record<string, unknown>> = [];
    const updated: Array<Record<string, unknown>> = [];
    const tx = {
      practitioner: {
        findUnique: jest.fn(async ({ where }: { where: { userId?: string; slug?: string } }) => {
          if (where.slug !== undefined) {
            // slug-uniqueness probe — pretend the desired slug is free
            return null;
          }
          return row && where.userId === row.userId ? { ...row } : null;
        }),
        create: jest.fn(async ({ data, select }: { data: Record<string, unknown>; select?: unknown }) => {
          row = { id: "p_new", slug: String(data.slug), status: String(data.status), userId: String(data.userId) };
          created.push(data);
          void select;
          return { id: row.id, slug: row.slug };
        }),
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          if (row && row.id === where.id) row = { ...row, ...(data as object) } as FakeRow;
          updated.push(data);
          return row;
        }),
      },
    };
    return { tx, get created() { return created; }, get updated() { return updated; }, get row() { return row; } };
  }

  it("creates an ACTIVE, unverified profile when none exists", async () => {
    const h = makeTx(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await ensurePractitionerForUser(h.tx as any, { userId: "u1", name: "Анна Иванова" });
    expect(res.created).toBe(true);
    expect(res.reactivated).toBe(false);
    expect(h.created).toHaveLength(1);
    expect(h.created[0]).toMatchObject({ userId: "u1", status: "ACTIVE", verified: false });
    expect(typeof h.created[0].slug).toBe("string");
    expect((h.created[0].slug as string).length).toBeGreaterThan(0);
  });

  it("reactivates a suspended profile instead of creating a duplicate", async () => {
    const h = makeTx({ id: "p1", slug: "anna", status: "SUSPENDED", userId: "u1" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await ensurePractitionerForUser(h.tx as any, { userId: "u1", name: "Anna" });
    expect(res.created).toBe(false);
    expect(res.reactivated).toBe(true);
    expect(h.created).toHaveLength(0);
    expect(h.updated[0]).toMatchObject({ status: "ACTIVE" });
  });

  it("is a no-op when the profile is already ACTIVE", async () => {
    const h = makeTx({ id: "p1", slug: "anna", status: "ACTIVE", userId: "u1" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await ensurePractitionerForUser(h.tx as any, { userId: "u1", name: "Anna" });
    expect(res.created).toBe(false);
    expect(res.reactivated).toBe(false);
    expect(h.created).toHaveLength(0);
    expect(h.updated).toHaveLength(0);
  });

  it("suspends an ACTIVE profile on demotion but keeps the row", async () => {
    const h = makeTx({ id: "p1", slug: "anna", status: "ACTIVE", userId: "u1" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await suspendPractitionerForUser(h.tx as any, "u1");
    expect(res.suspended).toBe(true);
    expect(h.updated[0]).toMatchObject({ status: "SUSPENDED" });
  });

  it("does not resurrect a BLOCKED profile on demotion", async () => {
    const h = makeTx({ id: "p1", slug: "anna", status: "BLOCKED", userId: "u1" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await suspendPractitionerForUser(h.tx as any, "u1");
    expect(res.suspended).toBe(false);
    expect(h.updated).toHaveLength(0);
  });
});

describe("B347 — admin role change wires practitioner provisioning", () => {
  it("PATCH converts CLIENT→PRACTITIONER by ensuring a profile, suspends on demotion", () => {
    const route = source("src/app/api/admin/users/route.ts");
    expect(route).toContain("ensurePractitionerForUser");
    expect(route).toContain("suspendPractitionerForUser");
    // Provisioning runs in the same transaction as the user mutation.
    expect(route).toMatch(/db\.\$transaction[\s\S]{0,400}ensurePractitionerForUser/);
    expect(route).toContain('logAudit(adminId, "PRACTITIONER_CREATE"');
  });

  it("admin-created practitioners are ACTIVE (participate in search), not PENDING", () => {
    const route = source("src/app/api/admin/users/route.ts");
    // The user-create POST path no longer parks practitioners in PENDING.
    expect(route).not.toMatch(/status: "PENDING"/);
  });
});

/**
 * B347 / Интерфейс 14 — настройки практика идентичны клиентским (вкладки с
 * переключателем); сохранение профиля не показывает «уведомления сохранены».
 */
describe("B347 — practitioner settings tabs", () => {
  it("uses a tabbed client component with the client-style switcher", () => {
    const client = source("src/app/cabinet/practitioner/profile/practitioner-settings-client.tsx");
    expect(client).toContain('"use client"');
    expect(client).toContain("setActiveTab");
    // B466: «Профиль» вынесен на собственную страницу (/practitioner/profile);
    // настройки держат аккаунт-вкладки.
    for (const label of ["Безопасность", "Уведомления", "Удаление"]) {
      expect(client).toContain(label);
    }
    expect(client).toContain("soft-chip-warm");
    const profilePage = source("src/app/cabinet/practitioner/profile/page.tsx");
    expect(profilePage).toContain("PractitionerProfileEditor");
  });

  it("profile save shows «Профиль обновлён», not the notifications toast", () => {
    const editor = source("src/app/cabinet/practitioner/profile/profile-editor.tsx");
    expect(editor).toContain('toast.success("Профиль обновлён")');
    expect(editor).not.toContain("Настройки уведомлений сохранены");
  });
});
