export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { Prisma, Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserPermissions, type Permission } from "@/lib/moderator-permissions";
import { PageContainer } from "@/components/ui/page-container";
import { UsersControlPanel, type AdminUserRow } from "./users-control-panel";

type SearchParams = {
  q?: string;
  role?: string;
  status?: string;
  channel?: string;
  sort?: string;
  dir?: string;
  page?: string;
};

// T4: acquisition channel is derived from the existing User.provider column
// (already in the DB). Each UI channel maps to one or more raw provider values;
// a missing/unknown provider is surfaced as "manual".
const CHANNEL_PROVIDERS: Record<string, string[]> = {
  web: ["web", "google", "mobile_web"],
  app: ["ios", "android"],
  telegram: ["telegram", "max"],
  vk: ["vk"],
  manual: ["manual"],
};

const PAGE_SIZE = 25;

const SORT_FIELDS = {
  name: "name",
  email: "email",
  role: "role",
  createdAt: "createdAt",
  balance: "balance",
} as const;

function allowedRoles(role: string, permissions: Permission[]) {
  if (role === "SUPERADMIN" || permissions.includes("users.view")) {
    return [Role.CLIENT, Role.PRACTITIONER, Role.ADMIN, Role.SUPERADMIN];
  }
  const roles: Role[] = [];
  if (permissions.includes("clients.view")) roles.push(Role.CLIENT);
  if (permissions.includes("practitioners.view")) roles.push(Role.PRACTITIONER);
  return roles;
}

function buildWhere(params: SearchParams, role: string, permissions: Permission[]): Prisma.UserWhereInput {
  const roles = allowedRoles(role, permissions);
  const where: Prisma.UserWhereInput = { role: { in: roles } };

  const q = params.q?.trim();
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { telegramUsername: { contains: q.replace(/^@/, ""), mode: "insensitive" } },
    ];
  }

  if (params.role && Object.values(Role).includes(params.role as Role) && roles.includes(params.role as Role)) {
    where.role = params.role as Role;
  }

  if (params.channel && CHANNEL_PROVIDERS[params.channel]) {
    const providers = CHANNEL_PROVIDERS[params.channel];
    where.provider = params.channel === "manual"
      ? { in: [...providers, ""] }
      : { in: providers };
  }

  if (params.status === "active") {
    where.deletedAt = null;
    where.blockedAt = null;
  } else if (params.status === "blocked") {
    where.blockedAt = { not: null };
  } else if (params.status === "deleted") {
    where.deletedAt = { not: null };
  } else if (params.status === "unverified") {
    where.emailVerified = false;
    where.deletedAt = null;
  }

  return where;
}

function buildOrderBy(params: SearchParams): Prisma.UserOrderByWithRelationInput {
  const field = SORT_FIELDS[params.sort as keyof typeof SORT_FIELDS] ?? "createdAt";
  const dir = params.dir === "asc" ? "asc" : "desc";
  return { [field]: dir };
}

export default async function AdminUsersPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await props.searchParams;
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/admin");

  const permissions = await getUserPermissions(session.user.id, role);
  const roles = allowedRoles(role, permissions);
  if (roles.length === 0) redirect("/admin");

  const page = Math.max(1, Number(params.page) || 1);
  const where = buildWhere(params, role, permissions);
  const orderBy = buildOrderBy(params);

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        deletedAt: true,
        blockedAt: true,
        emailVerified: true,
        freeToolsLimit: true,
        balance: true,
        provider: true,
        registrationChannel: true,
        telegramUsername: true,
        practitioner: {
          select: {
            id: true,
            status: true,
            title: true,
            commissionPercent: true,
            verified: true,
            verifiedAt: true,
            categories: true,
            directions: true,
            specialties: true,
            tags: true,
            pricePerSession: true,
            sessionDuration: true,
            priceRates: {
              select: { durationMin: true, priceRub: true, enabled: true },
              orderBy: { durationMin: "asc" },
            },
          },
        },
        _count: {
          select: {
            bookingsAsClient: true,
            entitlements: true,
            subscriptions: true,
          },
        },
      },
    }),
    db.user.count({ where }),
  ]);

  // U4: pull the actual granted permission KEYS for moderators on this page so
  // the edit modal can pre-fill the rights matrix without an extra round-trip.
  const moderatorIds = users
    .filter((user) => user.role === Role.ADMIN || user.role === Role.SUPERADMIN)
    .map((user) => user.id);
  const permissionRows = moderatorIds.length > 0
    ? await db.moderatorPermission.findMany({
      where: { moderatorId: { in: moderatorIds }, granted: true },
      select: { moderatorId: true, permission: true },
    })
    : [];
  const permissionsByUser = new Map<string, string[]>();
  for (const row of permissionRows) {
    const list = permissionsByUser.get(row.moderatorId) ?? [];
    list.push(row.permission);
    permissionsByUser.set(row.moderatorId, list);
  }

  // T4: clarity-credit balance per client (active pending+confirmed ledger sum).
  const clientIds = users.filter((u) => u.role === Role.CLIENT).map((u) => u.id);
  const creditSums = clientIds.length > 0
    ? await db.clarityCreditLedgerEntry.groupBy({
      by: ["userId"],
      where: { userId: { in: clientIds }, status: { in: ["pending", "confirmed"] } },
      _sum: { amount: true },
    })
    : [];
  const creditByUser = new Map(creditSums.map((row) => [row.userId, row._sum.amount ?? 0]));

  // U5 (antifraud): latest LOGIN audit per user → last-session timestamp + IP +
  // device + channel. distinct + desc returns the most recent row per user.
  const loginEvents = users.length > 0
    ? await db.auditLog.findMany({
      where: { userId: { in: users.map((u) => u.id) }, action: "LOGIN" },
      orderBy: { createdAt: "desc" },
      distinct: ["userId"],
      select: { userId: true, createdAt: true, ip: true, details: true },
    })
    : [];
  const lastLoginByUser = new Map(loginEvents.map((event) => {
    let device: string | null = null;
    let channel: string | null = null;
    if (event.details) {
      try {
        const parsed = JSON.parse(event.details) as { device?: unknown; channel?: unknown };
        device = typeof parsed.device === "string" ? parsed.device : null;
        channel = typeof parsed.channel === "string" ? parsed.channel : null;
      } catch {
        // legacy plain-text details ("Email: …" / "OAuth: …") — no structured data.
      }
    }
    return [event.userId, { at: event.createdAt.toISOString(), ip: event.ip, device, channel }];
  }));

  const rows: AdminUserRow[] = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    deletedAt: user.deletedAt?.toISOString() ?? null,
    blockedAt: user.blockedAt?.toISOString() ?? null,
    emailVerified: user.emailVerified,
    freeToolsLimit: user.freeToolsLimit,
    balance: user.balance,
    clarityCredits: creditByUser.get(user.id) ?? 0,
    provider: user.provider,
    telegramUsername: user.telegramUsername,
    practitioner: user.practitioner ? {
      id: user.practitioner.id,
      status: user.practitioner.status,
      title: user.practitioner.title,
      commissionPercent: user.practitioner.commissionPercent,
      verified: user.practitioner.verified,
      verifiedAt: user.practitioner.verifiedAt?.toISOString() ?? null,
      categories: user.practitioner.categories,
      directions: user.practitioner.directions,
      specialties: user.practitioner.specialties,
      tags: user.practitioner.tags,
      pricePerSession: user.practitioner.pricePerSession,
      sessionDuration: user.practitioner.sessionDuration,
      priceRates: user.practitioner.priceRates,
    } : null,
    moderatorPermissions: permissionsByUser.get(user.id) ?? [],
    moderatorPermissionsCount: (permissionsByUser.get(user.id) ?? []).length,
    bookingsCount: user._count.bookingsAsClient,
    entitlementsCount: user._count.entitlements,
    subscriptionsCount: user._count.subscriptions,
    registrationSource: user.registrationChannel ?? user.provider ?? null,
    lastLogin: lastLoginByUser.get(user.id) ?? null,
  }));

  const canCreate = role === "SUPERADMIN"
    || permissions.includes("users.create")
    || permissions.includes("clients.create")
    || permissions.includes("practitioners.create");

  return (
    <PageContainer maxWidth="full" className="py-8">
      <div className="mb-6" data-testid="admin-users-unified-page">
        <p className="premium-eyebrow">единый реестр</p>
        <h1 className="premium-title mt-2 text-3xl md:text-4xl">Все пользователи</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Клиенты, практики, модераторы и суперадмины в одной таблице с быстрым редактированием.
        </p>
      </div>

      <UsersControlPanel
        rows={rows}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        permissions={{
          canCreate,
          canEdit: role === "SUPERADMIN" || permissions.includes("users.edit") || permissions.includes("clients.edit"),
          canBlock: role === "SUPERADMIN" || permissions.includes("users.block") || permissions.includes("clients.block"),
          canResetPassword: role === "SUPERADMIN" || permissions.includes("users.reset_password") || permissions.includes("clients.reset_password"),
          canImpersonate: role === "SUPERADMIN" || permissions.includes("users.impersonate"),
          canManageRoles: role === "SUPERADMIN",
          canManageBalance: role === "SUPERADMIN",
          canManageRights: role === "SUPERADMIN",
          canSetPassword: role === "SUPERADMIN" || permissions.includes("users.set_password") || permissions.includes("clients.set_password"),
          canManagePractitioners: role === "SUPERADMIN" || permissions.includes("practitioners.edit"),
          canDelete: role === "SUPERADMIN" || permissions.includes("users.delete") || permissions.includes("clients.delete"),
        }}
      />
    </PageContainer>
  );
}
