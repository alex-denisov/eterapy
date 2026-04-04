import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import bcrypt from "bcryptjs";
import { logAudit } from "@/lib/audit";

const DURATIONS = [15, 30, 45, 60, 90, 120];

export async function POST(req: NextRequest) {
  const session = await auth();
  // @ts-expect-error custom
  if (session?.user?.role !== "SUPERADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const {
      name, email, password,
      title, bio, experience,
      specialties = [],
      tags = [],
      verified = false,
      founding = false,
      rates = [],
    } = body;

    if (!name || !email || !password || !title || !bio) {
      return NextResponse.json({ error: "Заполните все обязательные поля" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Пароль должен быть не менее 8 символов" }, { status: 400 });
    }

    // Check email uniqueness
    const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return NextResponse.json({ error: "Email уже используется" }, { status: 409 });

    const hashed = await bcrypt.hash(password, 10);

    // Transaction: User + Practitioner + PriceRates
    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          name,
          password: hashed,
          role: "PRACTITIONER",
          emailVerified: true, // admin-created accounts are pre-verified
        },
      });

      // Min price from enabled rates
      const enabledRates = rates.filter((r: { enabled: boolean; priceRub: number; durationMin: number }) => r.enabled);
      const minRate = enabledRates.length > 0
        ? Math.min(...enabledRates.map((r: { priceRub: number }) => r.priceRub))
        : 1500;
      const defaultDuration = enabledRates.length > 0
        ? enabledRates.sort((a: { durationMin: number }, b: { durationMin: number }) => a.durationMin - b.durationMin)[0].durationMin
        : 60;

      const practitioner = await tx.practitioner.create({
        data: {
          userId: user.id,
          status: "ACTIVE", // Admin-created practitioners are immediately active
          title,
          bio,
          experience: experience || "1 год",
          specialties,
          tags,
          verified,
          founding,
          pricePerSession: minRate,
          sessionDuration: defaultDuration,
        },
      });

      // Create price rates
      const validRates = rates.filter((r: { durationMin: number }) => DURATIONS.includes(r.durationMin));
      if (validRates.length > 0) {
        await tx.priceRate.createMany({
          data: validRates.map((r: { durationMin: number; priceRub: number; enabled: boolean }) => ({
            practitionerId: practitioner.id,
            durationMin: r.durationMin,
            priceRub: r.priceRub,
            enabled: r.enabled,
          })),
          skipDuplicates: true,
        });
      }

      return { user, practitioner };
    });

    // @ts-expect-error custom
    await logAudit(session.user.id, "PRACTITIONER_CREATE", result.user.id, `Создан практик: ${name} (${email})`);

    const minEnabledRate = rates.find((r: { enabled: boolean }) => r.enabled);

    return NextResponse.json({
      ok: true,
      practitioner: {
        id: result.practitioner.id,
        userId: result.user.id,
        name: result.user.name,
        email: result.user.email,
        avatarUrl: null,
        userBlockedAt: null,
        status: result.practitioner.status,
        title: result.practitioner.title,
        bio: result.practitioner.bio,
        experience: result.practitioner.experience,
        specialties: result.practitioner.specialties,
        tags: result.practitioner.tags,
        pricePerSession: result.practitioner.pricePerSession,
        sessionDuration: result.practitioner.sessionDuration,
        verified: result.practitioner.verified,
        founding: result.practitioner.founding,
        reviewCount: 0,
        sessionCount: 0,
        minRate: minEnabledRate?.priceRub ?? null,
        minRateDuration: minEnabledRate?.durationMin ?? null,
        createdAt: result.practitioner.createdAt.toISOString(),
      },
    });
  } catch (e: unknown) {
    console.error("Create practitioner error:", e);
    const msg = e instanceof Error ? e.message : "Ошибка сервера";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
