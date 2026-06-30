import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { Role, Specialty } from "@prisma/client";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { sendPasswordResetEmail } from "@/lib/email";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { generateUniqueSlug } from "@/lib/slug";
import { ensurePractitionerForUser, suspendPractitionerForUser } from "@/lib/practitioner-provisioning";

const CREATABLE_ROLES: Role[] = [Role.CLIENT, Role.PRACTITIONER, Role.ADMIN];

async function requireAdmin() {
  const session = await auth();
  if (!session || !["ADMIN","SUPERADMIN"].includes(session.user?.role ?? "")) return null;
  return session;
}

export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const search = req.nextUrl.searchParams.get("search") ?? "";
  const role = req.nextUrl.searchParams.get("role");

  const users = await db.user.findMany({
    where: {
      ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] } : {}),
      ...(role && Object.values(Role).includes(role as Role) ? { role: role as Role } : {}),
    },
    select: {
      id: true, name: true, email: true, role: true, createdAt: true, deletedAt: true,
      emailVerified: true, avatarUrl: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const adminId = session.user!.id!;
  const adminRole = session.user!.role!;
  const permissions = await getUserPermissions(adminId, adminRole);

  const body = await req.json().catch(() => ({}));
  const requestedRole = typeof body.role === "string" && CREATABLE_ROLES.includes(body.role as Role)
    ? body.role as Role
    : Role.CLIENT;
  const canCreateRole = adminRole === Role.SUPERADMIN
    || permissions.includes("users.create")
    || (requestedRole === Role.CLIENT && permissions.includes("clients.create"))
    || (requestedRole === Role.PRACTITIONER && permissions.includes("practitioners.create"));
  if (!canCreateRole || (requestedRole === Role.ADMIN && adminRole !== Role.SUPERADMIN)) {
    return NextResponse.json({ error: `Нет полномочия для создания роли ${requestedRole}` }, { status: 403 });
  }

  const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const rawPassword = typeof body.password === "string" ? body.password : "";
  const hasPassword = rawPassword.trim().length > 0;
  const birthDate = typeof body.birthDate === "string" && body.birthDate ? new Date(body.birthDate) : null;
  const birthTime = typeof body.birthTime === "string" && body.birthTime.trim() ? body.birthTime.trim() : null;
  const birthPlace = typeof body.birthPlace === "string" && body.birthPlace.trim() ? body.birthPlace.trim() : null;
  const timezone = typeof body.timezone === "string" && body.timezone.trim() ? body.timezone.trim() : null;
  const telegramUsername = typeof body.telegramUsername === "string"
    ? body.telegramUsername.trim().replace(/^@/, "") || null
    : null;
  const sendResetLink = !hasPassword && body.sendResetLink !== false; // default true when password is not set

  const title = typeof body.title === "string" && body.title.trim()
    ? body.title.trim()
    : "Практик ETerapy";
  const bio = typeof body.bio === "string" && body.bio.trim()
    ? body.bio.trim()
    : "Профиль создан администратором. Заполните описание перед публикацией.";
  const experience = typeof body.experience === "string" && body.experience.trim()
    ? body.experience.trim()
    : "1 год";
  const specialties = Array.isArray(body.specialties)
    ? body.specialties.filter((value: unknown): value is Specialty => (
        typeof value === "string" && Object.values(Specialty).includes(value as Specialty)
      ))
    : [];
  const pricePerSession = Number.isInteger(Number(body.pricePerSession)) && Number(body.pricePerSession) > 0
    ? Number(body.pricePerSession)
    : 1500;
  const sessionDuration = [15, 30, 45, 60, 90, 120].includes(Number(body.sessionDuration))
    ? Number(body.sessionDuration)
    : 60;

  if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    return NextResponse.json({ error: "Некорректный email" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Имя обязательно" }, { status: 400 });
  }
  if (hasPassword && rawPassword.length < 8) {
    return NextResponse.json({ error: "Пароль должен быть не менее 8 символов" }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { email: rawEmail }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "Email уже используется" }, { status: 409 });
  }

  // Without a manual password the account receives an unusable placeholder and a reset-link.
  const passwordToHash = hasPassword ? rawPassword : randomBytes(24).toString("hex");
  const hashed = await bcrypt.hash(passwordToHash, 10);
  const resetToken = sendResetLink ? randomBytes(24).toString("hex") : null;

  const created = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: rawEmail,
        name,
        password: hashed,
        role: requestedRole,
        emailVerified: hasPassword && requestedRole !== Role.CLIENT,
        provider: "manual", // canonical channel (registrationChannel column is legacy, read via resolveRegistrationChannel)
        birthDate,
        birthTime,
        birthPlace,
        timezone,
        telegramUsername,
        resetToken,
        resetExpires: resetToken ? new Date(Date.now() + 3_600_000) : null,
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    if (requestedRole !== Role.PRACTITIONER) {
      return { user, practitioner: null };
    }

    const slug = await generateUniqueSlug(name, async (candidate) => {
      const exists = await tx.practitioner.findUnique({ where: { slug: candidate }, select: { id: true } });
      return !!exists;
    });
    const practitioner = await tx.practitioner.create({
      data: {
        userId: user.id,
        slug,
        // B347/Механика 9: admin-created practitioners go live immediately so
        // their landing page works and they participate in search/recommendations.
        // verified stays false → "не верифицирован" badge (B354).
        status: "ACTIVE",
        title,
        bio,
        experience,
        specialties,
        pricePerSession,
        sessionDuration,
      },
      select: { id: true, slug: true, status: true },
    });

    return { user, practitioner };
  });

  await logAudit(
    adminId,
    requestedRole === Role.PRACTITIONER ? "PRACTITIONER_CREATE" : "REGISTER",
    created.user.id,
    `created ${requestedRole.toLowerCase()} by admin (manual)`,
  );

  if (resetToken) {
    try {
      await sendPasswordResetEmail(created.user.email, created.user.name, resetToken);
    } catch {
      // non-blocking — user still created, admin can resend from panel
    }
  }

  return NextResponse.json({ ok: true, user: created.user, practitioner: created.practitioner });
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const adminId = session.user!.id!;
  const adminRole = session.user!.role!;
  const { userId, role } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId обязателен" }, { status: 400 });
  if (adminRole !== "SUPERADMIN" && role !== undefined) {
    return NextResponse.json({ error: "Только суперадмин может менять роль пользователя" }, { status: 403 });
  }
  if (role !== undefined && !["CLIENT", "PRACTITIONER", "ADMIN"].includes(role)) {
    return NextResponse.json({ error: "Некорректная роль" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (role) data.role = role;
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Нет изменений" }, { status: 400 });

  // B347/Механика 9: a role change to/from PRACTITIONER must keep the
  // Practitioner profile in sync — otherwise a converted user has the role but
  // no landing page, attributes, or search participation.
  const { user, provisioning } = await db.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data,
      select: { id: true, name: true, role: true },
    });
    let provisioning: Awaited<ReturnType<typeof ensurePractitionerForUser>> | null = null;
    if (role === Role.PRACTITIONER) {
      provisioning = await ensurePractitionerForUser(tx, { userId, name: updated.name ?? "" });
    } else if (role) {
      // Demotion: hide the profile from the catalog without deleting data.
      await suspendPractitionerForUser(tx, userId);
    }
    return { user: updated, provisioning };
  });

  await logAudit(adminId, "PROFILE_UPDATE", userId, Object.keys(data).join(","));
  if (provisioning?.created) {
    await logAudit(adminId, "PRACTITIONER_CREATE", userId, "converted to practitioner by admin");
  }
  return NextResponse.json({ ok: true, user });
}
