import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { sendPasswordResetEmail } from "@/lib/email";
import { getUserPermissions } from "@/lib/moderator-permissions";

async function requireAdmin(req?: NextRequest) {
  const session = await auth();
  if (!session || !["ADMIN","SUPERADMIN"].includes(session.user?.role ?? "")) return null;
  return session;
}

export async function GET(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const search = req.nextUrl.searchParams.get("search") ?? "";
  const role = req.nextUrl.searchParams.get("role");

  const users = await db.user.findMany({
    where: {
      ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] } : {}),
      ...(role ? { role: role as "CLIENT" | "PRACTITIONER" | "ADMIN" } : {}),
    },
    select: {
      id: true, name: true, email: true, role: true, createdAt: true, deletedAt: true,
      emailVerified: true, freeToolsLimit: true, avatarUrl: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const adminId = session.user!.id!;
  const adminRole = session.user!.role!;
  const permissions = await getUserPermissions(adminId, adminRole);
  if (!permissions.includes("clients.create")) {
    return NextResponse.json({ error: "Нет полномочия clients.create" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const birthDate = typeof body.birthDate === "string" && body.birthDate ? new Date(body.birthDate) : null;
  const birthTime = typeof body.birthTime === "string" && body.birthTime.trim() ? body.birthTime.trim() : null;
  const birthPlace = typeof body.birthPlace === "string" && body.birthPlace.trim() ? body.birthPlace.trim() : null;
  const timezone = typeof body.timezone === "string" && body.timezone.trim() ? body.timezone.trim() : null;
  const telegramUsername = typeof body.telegramUsername === "string"
    ? body.telegramUsername.trim().replace(/^@/, "") || null
    : null;
  const sendResetLink = body.sendResetLink !== false; // default true

  if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    return NextResponse.json({ error: "Некорректный email" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Имя обязательно" }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { email: rawEmail }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "Email уже используется" }, { status: 409 });
  }

  // Random unusable placeholder password — user will set it via reset link
  const tempPassword = randomBytes(24).toString("hex");
  const hashed = await bcrypt.hash(tempPassword, 10);
  const resetToken = sendResetLink ? randomBytes(24).toString("hex") : null;

  const created = await db.user.create({
    data: {
      email: rawEmail,
      name,
      password: hashed,
      role: "CLIENT",
      emailVerified: false,
      provider: "manual", // canonical channel (registrationChannel column is legacy, read via resolveRegistrationChannel)
      birthDate,
      birthTime,
      birthPlace,
      timezone,
      telegramUsername,
      resetToken,
      resetExpires: resetToken ? new Date(Date.now() + 3_600_000) : null,
    },
    select: { id: true, email: true, name: true, createdAt: true },
  });

  await logAudit(adminId, "REGISTER", created.id, "created by admin (manual)");

  if (resetToken) {
    try {
      await sendPasswordResetEmail(created.email, created.name, resetToken);
    } catch {
      // non-blocking — user still created, admin can resend from panel
    }
  }

  return NextResponse.json({ ok: true, user: created });
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const { userId, freeToolsLimit, role } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId обязателен" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (freeToolsLimit !== undefined) data.freeToolsLimit = freeToolsLimit === "unlimited" ? 0 : Number(freeToolsLimit);
  if (role) data.role = role;

  const user = await db.user.update({ where: { id: userId }, data, select: { id: true, name: true, freeToolsLimit: true, role: true } });
  return NextResponse.json({ ok: true, user });
}
