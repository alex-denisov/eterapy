export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { Prisma, Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserPermissions, type Permission } from "@/lib/moderator-permissions";
import { computePractitionerBalances } from "@/lib/practitioner-balance";
import { getSubscriptionPlanLabel } from "@/lib/billing-labels";
import { getClarityCreditBalances } from "@/lib/clarity-credits";
import { PageContainer } from "@/components/ui/page-container";
import { UsersControlPanel, type AdminUserRow } from "./users-control-panel";

type SearchParams = {
  q?: string;
  role?: string;
  status?: string;
  channel?: string;
  created?: string;
  lastLogin?: string;
  credits?: string;
  bookings?: string;
  entitlements?: string;
  subscription?: string;
  antifraud?: string;
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

const PAGE_SIZE = 20;

const SORT_FIELDS = {
  name: "name",
  email: "email",
  role: "role",
  channel: "provider",
  createdAt: "createdAt",
} as const;

function valuesOf(param: string | undefined) {
  return (param ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function addAnd(where: Prisma.UserWhereInput, clause: Prisma.UserWhereInput) {
  const current = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
  where.AND = [...current, clause];
}

function parseExactNumber(param: string | undefined) {
  const value = param?.trim();
  if (!value || !/^\d+$/.test(value)) return null;
  return Number(value);
}

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

  const selectedRoles = valuesOf(params.role)
    .filter((value): value is Role => Object.values(Role).includes(value as Role))
    .filter((value) => roles.includes(value));
  if (selectedRoles.length > 0) {
    where.role = { in: selectedRoles };
  }

  const selectedChannels = valuesOf(params.channel).filter((value) => CHANNEL_PROVIDERS[value]);
  if (selectedChannels.length > 0) {
    const providerValues = new Set<string>();
    let includeEmptyProvider = false;
    for (const channel of selectedChannels) {
      for (const provider of CHANNEL_PROVIDERS[channel]) providerValues.add(provider);
      if (channel === "manual") includeEmptyProvider = true;
    }
    addAnd(where, {
      OR: [
        { provider: { in: [...providerValues] } },
        ...(includeEmptyProvider ? [{ provider: null }, { provider: "" }] : []),
      ],
    });
  }

  const selectedStatuses = valuesOf(params.status);
  const statusClauses: Prisma.UserWhereInput[] = [];
  if (selectedStatuses.includes("active")) statusClauses.push({ deletedAt: null, blockedAt: null });
  if (selectedStatuses.includes("blocked")) statusClauses.push({ blockedAt: { not: null } });
  if (selectedStatuses.includes("deleted")) statusClauses.push({ deletedAt: { not: null } });
  if (selectedStatuses.includes("unverified")) statusClauses.push({ emailVerified: false, deletedAt: null });
  if (statusClauses.length > 0) {
    addAnd(where, { OR: statusClauses });
  }

  const created = params.created?.trim();
  if (created && /^\d{4}-\d{2}-\d{2}$/.test(created)) {
    const start = new Date(`${created}T00:00:00.000Z`);
    const end = new Date(`${created}T23:59:59.999Z`);
    where.createdAt = { gte: start, lte: end };
  }

  return where;
}

async function addExactCountFilters(where: Prisma.UserWhereInput, params: SearchParams) {
  const credits = parseExactNumber(params.credits);
  if (credits !== null) {
    const creditRows = await db.clarityCreditLedgerEntry.findMany({
      where: { status: { in: ["pending", "confirmed"] } },
      select: { userId: true },
      distinct: ["userId"],
    });
    const creditBalances = await getClarityCreditBalances(creditRows.map((row) => row.userId));
    const matchingIds = [...creditBalances]
      .filter(([, balance]) => balance === credits)
      .map(([userId]) => userId);
    addAnd(where, credits === 0
      ? {
        role: Role.CLIENT,
        OR: [
          { id: { in: matchingIds } },
          { clarityCreditLedgerEntries: { none: { status: { in: ["pending", "confirmed"] } } } },
        ],
      }
      : { role: Role.CLIENT, id: { in: matchingIds } });
  }

  const bookings = parseExactNumber(params.bookings);
  if (bookings !== null) {
    const bookingRows = await db.booking.groupBy({
      by: ["clientId"],
      _count: { _all: true },
    });
    const matchingIds = bookingRows
      .filter((row) => row._count._all === bookings)
      .map((row) => row.clientId);
    addAnd(where, bookings === 0
      ? { OR: [{ id: { in: matchingIds } }, { bookingsAsClient: { none: {} } }] }
      : { id: { in: matchingIds } });
  }

  const entitlements = parseExactNumber(params.entitlements);
  if (entitlements !== null) {
    const entitlementRows = await db.productEntitlement.groupBy({
      by: ["userId"],
      _count: { _all: true },
    });
    const matchingIds = entitlementRows
      .filter((row) => row._count._all === entitlements)
      .map((row) => row.userId);
    addAnd(where, entitlements === 0
      ? { OR: [{ id: { in: matchingIds } }, { entitlements: { none: {} } }] }
      : { id: { in: matchingIds } });
  }
}

function activeSubscriptionWhere(now: Date) {
  return {
    status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] },
    OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
  } satisfies Prisma.UserSubscriptionWhereInput;
}

function addSubscriptionFilter(where: Prisma.UserWhereInput, params: SearchParams, now: Date) {
  const selected = valuesOf(params.subscription);
  if (selected.length === 0) return;
  const active = activeSubscriptionWhere(now);
  const planKeys = selected.filter((value) => value !== "free");
  const clauses: Prisma.UserWhereInput[] = [];
  if (selected.includes("free")) clauses.push({ subscriptions: { none: active } });
  if (planKeys.length > 0) clauses.push({ subscriptions: { some: { ...active, planKey: { in: planKeys } } } });
  if (clauses.length > 0) addAnd(where, { OR: clauses });
}

async function addAntifraudFilter(where: Prisma.UserWhereInput, params: SearchParams) {
  const selected = valuesOf(params.antifraud);
  if (selected.length === 0) return;
  const [fraudEvents, referralRisks] = await Promise.all([
    db.fraudEvent.findMany({
      where: { riskScore: { gt: 0 } },
      select: { subjectId: true, actorUserId: true, riskScore: true },
      take: 5000,
    }),
    db.referralAttribution.findMany({
      where: { riskScore: { gt: 0 } },
      select: { referrerUserId: true, referredUserId: true, riskScore: true },
      take: 5000,
    }),
  ]);
  const riskByUser = new Map<string, number>();
  function addRisk(userId: string | null | undefined, rawScore: number) {
    if (!userId) return;
    const score = Math.max(0, Math.min(10, Math.ceil(rawScore / 10)));
    riskByUser.set(userId, Math.max(riskByUser.get(userId) ?? 0, score));
  }
  for (const event of fraudEvents) {
    addRisk(event.subjectId, event.riskScore);
    addRisk(event.actorUserId, event.riskScore);
  }
  for (const item of referralRisks) {
    addRisk(item.referrerUserId, item.riskScore);
    addRisk(item.referredUserId, item.riskScore);
  }
  const riskIds = [...riskByUser.keys()];
  const clauses: Prisma.UserWhereInput[] = [];
  if (selected.includes("0")) clauses.push({ role: Role.CLIENT, id: { notIn: riskIds } });
  const bucketMatches = (min: number, max: number) => [...riskByUser.entries()]
    .filter(([, score]) => score >= min && score <= max)
    .map(([userId]) => userId);
  const riskyIds = [
    ...(selected.includes("1-4") ? bucketMatches(1, 4) : []),
    ...(selected.includes("5-7") ? bucketMatches(5, 7) : []),
    ...(selected.includes("8-10") ? bucketMatches(8, 10) : []),
  ];
  if (riskyIds.length > 0) clauses.push({ role: Role.CLIENT, id: { in: riskyIds } });
  addAnd(where, clauses.length > 0 ? { OR: clauses } : { id: { in: [] } });
}

function buildOrderBy(params: SearchParams): Prisma.UserOrderByWithRelationInput {
  const dir = params.dir === "asc" ? "asc" : "desc";
  if (params.sort === "bookings") return { bookingsAsClient: { _count: dir } };
  if (params.sort === "entitlements") return { entitlements: { _count: dir } };
  if (params.sort === "subscriptions") return { subscriptions: { _count: dir } };
  const field = SORT_FIELDS[params.sort as keyof typeof SORT_FIELDS] ?? "createdAt";
  return { [field]: dir };
}

function userStatusRank(row: AdminUserRow) {
  if (row.deletedAt) return 4;
  if (row.blockedAt) return 3;
  if (!row.emailVerified) return 2;
  return 1;
}

function postSortRows(rows: AdminUserRow[], params: SearchParams) {
  const dir = params.dir === "asc" ? 1 : -1;
  const valueFor = (row: AdminUserRow): number | string => {
    switch (params.sort) {
      case "credits":
        return row.clarityCredits;
      case "lastLogin":
        return row.lastLogin?.at ? Date.parse(row.lastLogin.at) : 0;
      case "status":
        return userStatusRank(row);
      case "bookings":
        return row.bookingsCount;
      case "entitlements":
        return row.entitlementsCount;
      case "subscriptions":
        return row.subscriptionLabel;
      case "channel":
        return row.provider ?? "";
      case "antifraud":
        return row.clientAntifraudScore ?? -1;
      default:
        return "";
    }
  };
  if (!["credits", "lastLogin", "status", "bookings", "entitlements", "subscriptions", "channel", "antifraud"].includes(params.sort ?? "")) {
    return rows;
  }
  return [...rows].sort((a, b) => {
    const left = valueFor(a);
    const right = valueFor(b);
    if (typeof left === "number" && typeof right === "number") return (left - right) * dir;
    return String(left).localeCompare(String(right), "ru") * dir;
  });
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
  const now = new Date();
  await addExactCountFilters(where, params);
  addSubscriptionFilter(where, params, now);
  await addAntifraudFilter(where, params);
  const lastLogin = params.lastLogin?.trim();
  if (lastLogin && /^\d{4}-\d{2}-\d{2}$/.test(lastLogin)) {
    const start = new Date(`${lastLogin}T00:00:00.000Z`);
    const end = new Date(`${lastLogin}T23:59:59.999Z`);
    const loginUserRows = await db.auditLog.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        action: { in: ["LOGIN", "REGISTER"] },
      },
      distinct: ["userId"],
      select: { userId: true },
    });
    addAnd(where, { id: { in: loginUserRows.map((item) => item.userId).filter((id): id is string => Boolean(id)) } });
  }
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
        testPaymentsEnabled: true,
        provider: true,
        registrationChannel: true,
        telegramUsername: true,
        birthDate: true,
        birthTime: true,
        birthPlace: true,
        timezone: true,
        practitioner: {
          select: {
            id: true,
            slug: true,
            status: true,
            title: true,
            bio: true,
            experience: true,
            commissionPercent: true,
            verified: true,
            verifiedAt: true,
            bookingOverrideEnabled: true,
            agentOfferAcceptedAt: true,
            agentOfferVersion: true,
            taxStatus: true,
            taxReviewStatus: true,
            taxStatusVerifiedAt: true,
            taxStatusRejectedReason: true,
            payoutDetails: { select: { type: true, inn: true, kycStatus: true } },
            categories: true,
            directions: true,
            specialties: true,
            tags: true,
            formats: true,
            pricePerSession: true,
            sessionDuration: true,
            ratingSum: true,
            reviewCount: true,
            sessionCount: true,
            priceRates: {
              select: { durationMin: true, priceRub: true, enabled: true },
              orderBy: { durationMin: "asc" },
            },
          },
        },
        subscriptions: {
          where: activeSubscriptionWhere(now),
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { planKey: true, status: true, currentPeriodEnd: true },
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

  // Use the same open-lot calculation as spending and admin adjustments. A raw
  // ledger sum includes expired grants and makes a requested target appear larger.
  const clientIds = users.filter((u) => u.role === Role.CLIENT).map((u) => u.id);
  const creditByUser = await getClarityCreditBalances(clientIds);

  const [fraudEvents, referralRisks] = clientIds.length > 0
    ? await Promise.all([
      db.fraudEvent.findMany({
        where: {
          riskScore: { gt: 0 },
          OR: [
            { subjectId: { in: clientIds } },
            { actorUserId: { in: clientIds } },
          ],
        },
        orderBy: { riskScore: "desc" },
        take: 1000,
        select: { subjectId: true, actorUserId: true, riskScore: true },
      }),
      db.referralAttribution.findMany({
        where: {
          riskScore: { gt: 0 },
          OR: [
            { referrerUserId: { in: clientIds } },
            { referredUserId: { in: clientIds } },
          ],
        },
        orderBy: { riskScore: "desc" },
        take: 1000,
        select: { referrerUserId: true, referredUserId: true, riskScore: true },
      }),
    ])
    : [[], []] as const;
  const clientSet = new Set(clientIds);
  const antifraudByUser = new Map<string, number>();
  function addClientRisk(userId: string | null | undefined, rawScore: number) {
    if (!userId || !clientSet.has(userId)) return;
    const score = Math.max(0, Math.min(10, Math.ceil(rawScore / 10)));
    antifraudByUser.set(userId, Math.max(antifraudByUser.get(userId) ?? 0, score));
  }
  for (const event of fraudEvents) {
    addClientRisk(event.subjectId, event.riskScore);
    addClientRisk(event.actorUserId, event.riskScore);
  }
  for (const item of referralRisks) {
    addClientRisk(item.referrerUserId, item.riskScore);
    addClientRisk(item.referredUserId, item.riskScore);
  }

  // U5 (antifraud): latest session-establishing audit per user → last-session
  // timestamp + IP + device + channel. distinct + desc returns the most recent
  // row per user.
  // B359 / Баг 2: include REGISTER alongside LOGIN so a just-registered user
  // (who has a REGISTER event with captured IP/device but may not have a
  // separate LOGIN yet) still shows a «последняя сессия» instead of "—".
  const loginEvents = users.length > 0
    ? await db.auditLog.findMany({
      where: { userId: { in: users.map((u) => u.id) }, action: { in: ["LOGIN", "REGISTER"] } },
      orderBy: { createdAt: "desc" },
      distinct: ["userId"],
      select: { userId: true, createdAt: true, ip: true, details: true },
    })
    : [];
  const lastLoginByUser = new Map(loginEvents.map((event) => {
    let device: string | null = null;
    let channel: string | null = null;
    let fingerprint: string | null = null;
    if (event.details) {
      try {
        const parsed = JSON.parse(event.details) as { device?: unknown; channel?: unknown; fingerprint?: unknown };
        device = typeof parsed.device === "string" ? parsed.device : null;
        channel = typeof parsed.channel === "string" ? parsed.channel : null;
        fingerprint = typeof parsed.fingerprint === "string" ? parsed.fingerprint : null;
      } catch {
        // legacy plain-text details ("Email: …" / "OAuth: …") — no structured data.
      }
    }
    return [event.userId, { at: event.createdAt.toISOString(), ip: event.ip, device, channel, fingerprint }];
  }));

  const practitionerIds = users.map((user) => user.practitioner?.id).filter((id): id is string => Boolean(id));
  const [practitionerBalances, complaintRows] = await Promise.all([
    computePractitionerBalances(practitionerIds),
    practitionerIds.length > 0
      ? db.complaint.findMany({
        where: {
          status: { in: ["OPEN", "REVIEWING"] },
          booking: { practitionerId: { in: practitionerIds } },
        },
        select: { booking: { select: { practitionerId: true } } },
      })
      : Promise.resolve([]),
  ]);
  const openComplaintCount = new Map<string, number>();
  for (const row of complaintRows) {
    const practitionerId = row.booking.practitionerId;
    openComplaintCount.set(practitionerId, (openComplaintCount.get(practitionerId) ?? 0) + 1);
  }

  const rows: AdminUserRow[] = postSortRows(users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    deletedAt: user.deletedAt?.toISOString() ?? null,
    blockedAt: user.blockedAt?.toISOString() ?? null,
    emailVerified: user.emailVerified,
    testPaymentsEnabled: user.testPaymentsEnabled,
    clarityCredits: creditByUser.get(user.id) ?? 0,
    provider: user.provider,
    telegramUsername: user.telegramUsername,
    birthDate: user.birthDate?.toISOString() ?? null,
    birthTime: user.birthTime,
    birthPlace: user.birthPlace,
    timezone: user.timezone,
    practitioner: user.practitioner ? (() => {
      const balance = practitionerBalances.get(user.practitioner.id);
      return {
        id: user.practitioner.id,
        slug: user.practitioner.slug,
        status: user.practitioner.status,
        title: user.practitioner.title,
        bio: user.practitioner.bio,
        experience: user.practitioner.experience,
        commissionPercent: user.practitioner.commissionPercent,
        verified: user.practitioner.verified,
        verifiedAt: user.practitioner.verifiedAt?.toISOString() ?? null,
        bookingOverrideEnabled: user.practitioner.bookingOverrideEnabled,
        agentOfferAcceptedAt: user.practitioner.agentOfferAcceptedAt?.toISOString() ?? null,
        agentOfferVersion: user.practitioner.agentOfferVersion,
        taxStatus: user.practitioner.taxStatus,
        taxReviewStatus: user.practitioner.taxReviewStatus,
        taxStatusVerifiedAt: user.practitioner.taxStatusVerifiedAt?.toISOString() ?? null,
        taxStatusRejectedReason: user.practitioner.taxStatusRejectedReason,
        payoutDetailsType: user.practitioner.payoutDetails?.type ?? null,
        payoutDetailsInn: user.practitioner.payoutDetails?.inn ?? null,
        payoutDetailsKycStatus: user.practitioner.payoutDetails?.kycStatus ?? null,
        categories: user.practitioner.categories,
        directions: user.practitioner.directions,
        specialties: user.practitioner.specialties,
        tags: user.practitioner.tags,
        formats: user.practitioner.formats,
        pricePerSession: user.practitioner.pricePerSession,
        sessionDuration: user.practitioner.sessionDuration,
        priceRates: user.practitioner.priceRates,
        reviewCount: user.practitioner.reviewCount,
        sessionCount: user.practitioner.sessionCount,
        avgRating: user.practitioner.reviewCount > 0 ? user.practitioner.ratingSum / user.practitioner.reviewCount : null,
        openComplaintCount: openComplaintCount.get(user.practitioner.id) ?? 0,
        accruedNet: balance?.accruedNet ?? 0,
        paidOut: balance?.paidOut ?? 0,
        pendingPayout: balance?.pendingPayout ?? 0,
        availablePayout: balance?.availablePayout ?? 0,
        heldPayout: balance?.heldPayout ?? 0,
        currentBalance: balance?.currentBalance ?? 0,
      };
    })() : null,
    moderatorPermissions: permissionsByUser.get(user.id) ?? [],
    moderatorPermissionsCount: (permissionsByUser.get(user.id) ?? []).length,
    bookingsCount: user._count.bookingsAsClient,
    entitlementsCount: user._count.entitlements,
    subscriptionsCount: user._count.subscriptions,
    subscriptionLabel: (user.role === Role.CLIENT || user.role === Role.PRACTITIONER)
      ? getSubscriptionPlanLabel(user.subscriptions[0]?.planKey)
      : "—",
    subscriptionPlanKey: user.subscriptions[0]?.planKey ?? null,
    subscriptionStatus: user.subscriptions[0]?.status ?? null,
    clientAntifraudScore: user.role === Role.CLIENT ? antifraudByUser.get(user.id) ?? 0 : null,
    registrationSource: user.registrationChannel ?? user.provider ?? null,
    lastLogin: lastLoginByUser.get(user.id) ?? null,
  })), params);

  const canCreate = role === "SUPERADMIN"
    || permissions.includes("users.create")
    || permissions.includes("clients.create")
    || permissions.includes("practitioners.create");

  return (
    <PageContainer maxWidth="full" className="py-8">
      <div className="mb-6" data-testid="admin-users-unified-page">
        <p className="premium-eyebrow">продукт и клиенты</p>
        <h1 className="premium-title mt-2 text-3xl md:text-4xl">Пользователи и сегменты</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Клиенты, практики, модераторы и суперадмины в одной таблице: статусы, канал регистрации, входы, баллы, подписки и быстрые действия.
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
          canBlockPractitioners: role === "SUPERADMIN" || permissions.includes("practitioners.block"),
          canSetPractitionerRates: role === "SUPERADMIN" || permissions.includes("practitioners.set_rates"),
          canViewPractitionerFinance: role === "SUPERADMIN" || permissions.includes("practitioners.view_earnings"),
          canPayoutPractitioners: role === "SUPERADMIN" || permissions.includes("practitioners.payout"),
          canVerifyPractitioners: role === "SUPERADMIN" || permissions.includes("practitioners.verify"),
          canViewClientSessions: role === "SUPERADMIN" || permissions.includes("clients.view_sessions"),
          canViewClientEvents: role === "SUPERADMIN" || permissions.includes("clients.view_events"),
          canDelete: role === "SUPERADMIN" || permissions.includes("users.delete") || permissions.includes("clients.delete"),
        }}
      />
    </PageContainer>
  );
}
