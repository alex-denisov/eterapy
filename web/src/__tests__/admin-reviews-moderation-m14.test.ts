import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("M14 — admin reviews moderation", () => {
  it("exposes a moderation API with PATCH status + DELETE and recomputes counters", () => {
    const api = source("src/app/api/admin/reviews/[id]/route.ts");
    expect(api).toContain("export async function PATCH");
    expect(api).toContain("export async function DELETE");
    // only PUBLISHED reviews drive the public rating
    expect(api).toContain('status: "PUBLISHED"');
    expect(api).toContain("recomputePractitionerRating");
    expect(api).toContain("reviewCount");
    expect(api).toContain("ratingSum");
    // moderation is gated and audited
    expect(api).toContain("isModerator");
    expect(api).toContain("REVIEW_MODERATE");
    expect(api).toContain("REVIEW_DELETE");
    // delete is admin/superadmin only
    expect(api).toContain('role === "ADMIN" || role === "SUPERADMIN"');
  });

  it("renders an admin page that lists reviews and a manager", () => {
    const page = source("src/app/admin/reviews/page.tsx");
    expect(page).toContain("db.review.findMany");
    expect(page).toContain("ReviewsManager");
    expect(page).toContain('["ADMIN", "SUPERADMIN", "MODERATOR"]');

    const manager = source("src/app/admin/reviews/reviews-manager.tsx");
    expect(manager).toContain('data-testid="admin-reviews-manager"');
    expect(manager).toContain('data-testid="admin-review-row"');
    // R1: practitioner + author filters and sort.
    expect(manager).toContain('data-testid="reviews-filter-practitioner"');
    expect(manager).toContain('data-testid="reviews-filter-author"');
    expect(manager).toContain('data-testid="reviews-sort"');
    expect(manager).toContain("rating-desc");
    // R2: exact time, not just date.
    expect(manager).toContain("function formatDateTime");
    expect(manager).toContain('hour: "2-digit"');
    expect(manager).toContain('fetch(`/api/admin/reviews/${id}`');
    expect(manager).toContain('method: "PATCH"');
    expect(manager).toContain('method: "DELETE"');
    expect(manager).toContain("Опубликовать");
    expect(manager).toContain("Скрыть");
    expect(manager).toContain("Удалить");
  });

  it("adds an Отзывы nav link to the admin shell", () => {
    const shell = source("src/app/admin/admin-shell.tsx");
    expect(shell).toContain('adminUrl("/admin/reviews")');
    expect(shell).toContain('label: "Отзывы"');
  });
});
