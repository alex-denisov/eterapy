export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { BookOpenText, FileText, MessageSquareWarning, ShieldAlert, Star } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { canReviewAntifraud, getAdminAntifraudData } from "@/lib/admin-antifraud";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { parsePractitionerVerificationMarker } from "@/lib/practitioner-verification";
import { PageContainer } from "@/components/ui/page-container";
import { ApplicationsManager } from "../../applications/applications-manager";
import { AdminAntifraudPanel } from "../../antifraud/admin-antifraud-panel";
import { ComplaintsManager } from "../../complaints/complaints-manager";
import { ReviewsManager } from "../../reviews/reviews-manager";
import { LibraryRequestsManager, type LibraryRequestRow } from "./library-requests-manager";

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.05em] text-[var(--soft-ink-soft)]">
        <Icon className="h-4 w-4 text-[var(--soft-bordeaux)]" />
        {label}
      </div>
      <p className="text-2xl font-semibold text-[var(--soft-bordeaux)] tabular-nums">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-soft)]">{hint}</p>
    </div>
  );
}

function asSessionComplianceEvidence(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as {
    status?: unknown;
    riskScore?: unknown;
    riskFlags?: unknown;
    severity?: unknown;
    summary?: unknown;
    evidenceQuotes?: unknown;
    moderatorRecommendation?: unknown;
  };
  return {
    status: typeof item.status === "string" ? item.status : "review",
    riskScore: typeof item.riskScore === "number" ? item.riskScore : 0,
    riskFlags: Array.isArray(item.riskFlags) ? item.riskFlags.map(String) : [],
    severity: typeof item.severity === "string" ? item.severity : "medium",
    summary: typeof item.summary === "string" ? item.summary : "",
    evidenceQuotes: Array.isArray(item.evidenceQuotes) ? item.evidenceQuotes.map(String) : [],
    moderatorRecommendation: typeof item.moderatorRecommendation === "string" ? item.moderatorRecommendation : "",
  };
}

async function loadComplaints() {
  const complaints = await db.complaint.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      booking: {
        include: {
          client: { select: { name: true, email: true } },
          practitioner: { select: { id: true, slug: true, user: { select: { name: true } } } },
          payouts: {
            where: { status: "HELD" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, amountKopecks: true, status: true },
          },
          videoSession: {
            include: {
              messages: {
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  text: true,
                  fileName: true,
                  fileUrl: true,
                  fileMime: true,
                  createdAt: true,
                  sender: { select: { name: true } },
                },
              },
            },
          },
        },
      },
      reporter: { select: { name: true, email: true } },
    },
  });

  return complaints.map((complaint) => ({
    id: complaint.id,
    status: complaint.status,
    reason: complaint.reason,
    description: complaint.description,
    resolution: complaint.resolution,
    createdAt: complaint.createdAt.toISOString(),
    resolvedAt: complaint.resolvedAt?.toISOString() ?? null,
    clientName: complaint.reporter.name,
    clientEmail: complaint.reporter.email,
    practitionerName: complaint.booking.practitioner.user.name,
    practitionerId: complaint.booking.practitioner.id,
    practitionerSlug: complaint.booking.practitioner.slug,
    bookingId: complaint.bookingId,
    priceRub: complaint.booking.priceRub,
    heldPayoutKopecks: complaint.booking.payouts[0]?.amountKopecks ?? null,
    transcriptText: complaint.booking.videoSession?.messages
      .filter((message) => message.text)
      .map((message) => `[${new Date(message.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}] ${message.sender.name}: ${message.text}`)
      .join("\n") ?? null,
    recordingUrl: complaint.booking.videoSession?.recordingUrl ?? null,
    recordingExpiry: complaint.booking.videoSession?.recordingExpiry?.toISOString() ?? null,
    summaryText: complaint.booking.videoSession?.summaryText ?? null,
    practitionerNotesText: complaint.booking.videoSession?.practitionerNotesText ?? null,
    clientFollowupDraft: complaint.booking.videoSession?.clientFollowupDraft ?? null,
    sessionTranscriptText: complaint.booking.videoSession?.transcriptText ?? null,
    complianceStatus: complaint.booking.videoSession?.complianceStatus ?? null,
    complianceRiskScore: complaint.booking.videoSession?.complianceRiskScore ?? null,
    complianceEvidence: asSessionComplianceEvidence(complaint.booking.videoSession?.complianceEvidence),
    sessionMessages: complaint.booking.videoSession?.messages.map((message) => ({
      text: message.text,
      fileName: message.fileName,
      fileUrl: message.fileUrl,
      senderName: message.sender.name,
      createdAt: message.createdAt.toISOString(),
    })) ?? [],
  }));
}

async function loadApplications() {
  const applications = await db.practitionerApplication.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return applications.map((application) => {
    const verificationPractitionerId = parsePractitionerVerificationMarker(application.why);
    return {
      ...application,
      kind: verificationPractitionerId ? "VERIFICATION" as const : "APPLICATION" as const,
      verificationPractitionerId,
      createdAt: application.createdAt.toISOString(),
      updatedAt: application.updatedAt.toISOString(),
    };
  });
}

async function loadLibraryRequests(): Promise<LibraryRequestRow[]> {
  const dialogues = await db.dialogue.findMany({
    where: {
      libraryStatus: { in: ["PENDING_REVIEW", "PUBLISHED", "WITHDRAWN"] },
      deletedAt: null,
    },
    orderBy: { libraryConsentAt: "desc" },
    take: 100,
    include: {
      user: { select: { name: true, email: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { content: true },
      },
    },
  });
  return dialogues.map((dialogue) => ({
    id: dialogue.id,
    title: dialogue.title,
    question: dialogue.messages[0]?.content ?? dialogue.title,
    userName: dialogue.user?.name ?? "Гость",
    userEmail: dialogue.user?.email ?? "—",
    status: dialogue.libraryStatus ?? "PENDING_REVIEW",
    consentAt: dialogue.libraryConsentAt?.toISOString() ?? null,
    createdAt: dialogue.createdAt.toISOString(),
  }));
}

export default async function ProductQualityPage() {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN", "MODERATOR"].includes(role)) redirect("/admin");

  const permissions = await getUserPermissions(session.user.id, role);
  const canReview = role === "ADMIN" || role === "SUPERADMIN" || role === "MODERATOR" || permissions.includes("safety.review");
  const canDeleteReviews = role === "ADMIN" || role === "SUPERADMIN";
  const canOpenAntifraud = canReviewAntifraud(role, permissions);
  const canManagePractitionerOps = role === "ADMIN" || role === "SUPERADMIN" || permissions.includes("practitioners.view");
  const canModerateLibrary = role === "ADMIN" || role === "SUPERADMIN" || permissions.includes("library.moderate");
  if (!canReview && !canOpenAntifraud && !canManagePractitionerOps && !canModerateLibrary) redirect("/admin");

  const [reviews, complaints, applications, libraryRequests, antifraudData] = await Promise.all([
    canReview
      ? db.review.findMany({
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 200,
        select: {
          id: true,
          rating: true,
          text: true,
          status: true,
          riskScore: true,
          riskFlags: true,
          createdAt: true,
          author: { select: { name: true, email: true } },
          practitioner: {
            select: { id: true, slug: true, user: { select: { name: true } } },
          },
        },
      })
      : Promise.resolve([]),
    canReview ? loadComplaints() : Promise.resolve([]),
    canManagePractitionerOps ? loadApplications() : Promise.resolve([]),
    canModerateLibrary ? loadLibraryRequests() : Promise.resolve([]),
    canOpenAntifraud ? getAdminAntifraudData() : Promise.resolve(null),
  ]);

  const serializedReviews = reviews.map((review) => ({
    id: review.id,
    rating: review.rating,
    text: review.text,
    status: review.status,
    riskScore: review.riskScore,
    riskFlags: review.riskFlags,
    createdAt: review.createdAt.toISOString(),
    authorName: review.author?.name ?? "Аноним",
    authorEmail: review.author?.email ?? "",
    practitionerName: review.practitioner?.user?.name ?? "—",
    practitionerSlug: review.practitioner?.slug ?? "",
  }));

  const pendingReviews = serializedReviews.filter((review) => review.status === "REVIEW").length;
  const openComplaints = complaints.filter((complaint) => complaint.status === "OPEN" || complaint.status === "REVIEWING").length;
  const pendingApplications = applications.filter((application) => application.status === "PENDING" || application.status === "REVIEWING").length;
  const pendingLibrary = libraryRequests.filter((request) => request.status === "PENDING_REVIEW").length;

  return (
    <PageContainer maxWidth="full">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="premium-eyebrow">продукт · операции · качество</p>
          <h1 className="premium-title mt-2 text-3xl md:text-4xl">Операции и качество</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Единая очередь клиентских и практических операций: жалобы, заявки, документы, отзывы, вопросы библиотеки и антифрод.
          </p>
        </div>
      </div>

      <section className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={MessageSquareWarning} label="Жалобы" value={formatNumber(openComplaints)} hint="Новые и рассматриваемые обращения." />
        <MetricCard icon={FileText} label="Заявки практиков" value={formatNumber(pendingApplications)} hint="Регистрация и валидация документов." />
        <MetricCard icon={Star} label="Отзывы" value={formatNumber(pendingReviews)} hint="Модерация, публикация, скрытие и правка." />
        <MetricCard icon={BookOpenText} label="Библиотека" value={formatNumber(pendingLibrary)} hint="Вопросы клиентов с согласием на публикацию." />
        <MetricCard icon={ShieldAlert} label="Антифрод" value={formatNumber(antifraudData?.metrics.reviewQueue ?? 0)} hint="События, требующие ручного решения." />
      </section>

      <div className="space-y-6">
        {canReview && (
          <section className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)]">
            <div className="border-b border-[var(--soft-paper-edge)] px-4 py-3">
              <h2 className="text-base font-semibold">Жалобы и риск-сессии</h2>
            </div>
            <div className="p-4">
              <ComplaintsManager complaints={complaints} />
            </div>
          </section>
        )}

        {canManagePractitionerOps && (
          <section className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)]">
            <div className="border-b border-[var(--soft-paper-edge)] px-4 py-3">
              <h2 className="text-base font-semibold">Заявки практиков и документы</h2>
            </div>
            <div className="p-4">
              <ApplicationsManager applications={applications} adminRole={role} />
            </div>
          </section>
        )}

        {canModerateLibrary && (
          <section className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)]">
            <div className="border-b border-[var(--soft-paper-edge)] px-4 py-3">
              <h2 className="text-base font-semibold">Модерация вопросов библиотеки</h2>
            </div>
            <div className="p-4">
              <LibraryRequestsManager rows={libraryRequests} />
            </div>
          </section>
        )}

        {canReview && (
          <section className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)]">
            <div className="border-b border-[var(--soft-paper-edge)] px-4 py-3">
              <h2 className="text-base font-semibold">Отзывы</h2>
            </div>
            <div className="p-4">
              <ReviewsManager reviews={serializedReviews} canDelete={canDeleteReviews} />
            </div>
          </section>
        )}

        {antifraudData && (
          <section className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)]">
            <div className="border-b border-[var(--soft-paper-edge)] px-4 py-3">
              <h2 className="text-base font-semibold">Антифрод</h2>
            </div>
            <div className="p-4">
              <AdminAntifraudPanel initialData={antifraudData} />
            </div>
          </section>
        )}

        {!canReview && !canManagePractitionerOps && !canModerateLibrary && !antifraudData && (
          <div className="rounded-lg border border-dashed border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] px-4 py-8 text-center text-sm text-[var(--soft-ink-soft)]">
            Для вашей роли нет доступных очередей контроля.
          </div>
        )}
      </div>
    </PageContainer>
  );
}
