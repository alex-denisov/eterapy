/**
 * B347 / Механика 9 — единый механизм «создания» практика.
 *
 * Любой административный путь, который делает пользователя практиком
 * (создание нового пользователя-практика, перевод роли CLIENT→PRACTITIONER
 * через суперадминку), обязан создать запись `Practitioner`. Без неё у
 * пользователя есть роль, но нет публичной страницы, атрибутов и участия в
 * поиске/отборе/рекомендациях.
 *
 * Административно созданный/переведённый практик становится `ACTIVE`
 * (виден в каталоге и участвует в поиске) и `verified: false` (показывается
 * с плашкой «не верифицирован», см. B354). Публичные заявки практиков идут
 * другим путём (модерация → `PENDING`) и здесь не затрагиваются.
 */
import type { Prisma } from "@prisma/client";
import { generateUniqueSlug } from "@/lib/slug";

export const DEFAULT_PRACTITIONER_TITLE = "Практик ETerapy";
export const DEFAULT_PRACTITIONER_BIO =
  "Профиль создан администратором. Заполните описание перед публикацией.";
export const DEFAULT_PRACTITIONER_EXPERIENCE = "1 год";
export const DEFAULT_PRACTITIONER_PRICE = 1500;
export const DEFAULT_PRACTITIONER_DURATION = 60;

export interface PractitionerDefaults {
  title?: string;
  bio?: string;
  experience?: string;
  pricePerSession?: number;
  sessionDuration?: number;
}

export interface EnsurePractitionerResult {
  /** New `Practitioner` row was created. */
  created: boolean;
  /** Existing suspended row was reactivated to `ACTIVE`. */
  reactivated: boolean;
  practitionerId: string;
  slug: string;
}

/**
 * Idempotently make sure `userId` owns an `ACTIVE` practitioner profile.
 *
 * - No row yet → create one (`ACTIVE`, `verified: false`, unique slug, defaults).
 * - Row exists but not `ACTIVE` → reactivate (admin re-grants the role).
 * - Row already `ACTIVE` → no-op.
 *
 * Must run inside a transaction so the slug-uniqueness check and the create
 * stay consistent with the surrounding user mutation.
 */
export async function ensurePractitionerForUser(
  tx: Prisma.TransactionClient,
  params: { userId: string; name: string } & PractitionerDefaults,
): Promise<EnsurePractitionerResult> {
  const existing = await tx.practitioner.findUnique({
    where: { userId: params.userId },
    select: { id: true, slug: true, status: true },
  });

  if (existing) {
    if (existing.status !== "ACTIVE") {
      await tx.practitioner.update({
        where: { id: existing.id },
        data: { status: "ACTIVE" },
      });
      return { created: false, reactivated: true, practitionerId: existing.id, slug: existing.slug };
    }
    return { created: false, reactivated: false, practitionerId: existing.id, slug: existing.slug };
  }

  const slug = await generateUniqueSlug(params.name || "practitioner", async (candidate) => {
    const hit = await tx.practitioner.findUnique({ where: { slug: candidate }, select: { id: true } });
    return !!hit;
  });

  const practitioner = await tx.practitioner.create({
    data: {
      userId: params.userId,
      slug,
      status: "ACTIVE",
      verified: false,
      title: params.title?.trim() || DEFAULT_PRACTITIONER_TITLE,
      bio: params.bio?.trim() || DEFAULT_PRACTITIONER_BIO,
      experience: params.experience?.trim() || DEFAULT_PRACTITIONER_EXPERIENCE,
      pricePerSession: params.pricePerSession ?? DEFAULT_PRACTITIONER_PRICE,
      sessionDuration: params.sessionDuration ?? DEFAULT_PRACTITIONER_DURATION,
    },
    select: { id: true, slug: true },
  });

  return { created: true, reactivated: false, practitionerId: practitioner.id, slug: practitioner.slug };
}

/**
 * Demotion path: a user who is no longer a practitioner should disappear from
 * the catalog/search without losing their data. We keep the row and flip it to
 * `SUSPENDED` (only if it was `ACTIVE` — never resurrect a `BLOCKED` profile).
 */
export async function suspendPractitionerForUser(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<{ suspended: boolean }> {
  const existing = await tx.practitioner.findUnique({
    where: { userId },
    select: { id: true, status: true },
  });
  if (existing && existing.status === "ACTIVE") {
    await tx.practitioner.update({ where: { id: existing.id }, data: { status: "SUSPENDED" } });
    return { suspended: true };
  }
  return { suspended: false };
}
