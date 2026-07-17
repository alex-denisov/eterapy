import db from "@/lib/db";
import type { Permission } from "@/lib/moderator-permissions";

export type AdminNavCounts = {
  applications: number;
  bookings: number;
  complaints: number;
  reviews: number;
  libraryRequests: number;
  support: number;
  quality: number;
};

// X9 / INC-065: sidebar «непрочитанные» counters — actionable items awaiting
// a moderator. Shared by the admin layout (SSR initial value) and
// GET /api/admin/nav-counts (live refresh from AdminShell).
export async function getAdminNavCounts(permissions: Permission[]): Promise<AdminNavCounts> {
  const [applications, bookings, complaints, reviews, libraryRequests, support] = await Promise.all([
    db.practitionerApplication.count({ where: { status: "PENDING" } }).catch(() => 0),
    db.booking.count({ where: { status: "PENDING" } }).catch(() => 0),
    db.complaint.count({ where: { status: "OPEN" } }).catch(() => 0),
    db.review.count({ where: { status: "REVIEW" } }).catch(() => 0),
    db.dialogue.count({ where: { libraryStatus: "PENDING_REVIEW", deletedAt: null } }).catch(() => 0),
    permissions.includes("support.manage")
      ? db.supportConversation.count({ where: { status: "OPEN" } }).catch(() => 0)
      : Promise.resolve(0),
  ]);
  return {
    applications,
    bookings,
    complaints,
    reviews,
    libraryRequests,
    support,
    quality: applications + complaints + reviews + libraryRequests,
  };
}
