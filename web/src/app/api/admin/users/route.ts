import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

async function requireAdmin(req?: NextRequest) {
  const session = await auth();
  // @ts-expect-error custom
  if (!session || session.user?.role !== "ADMIN") return null;
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
