import fs from "node:fs";
import path from "node:path";

// B359 / Интерфейс 11 — the «новых отзывов» sidebar badge must reset once the
// practitioner opens /practitioner/reviews (was a rolling 14-day window).

const root = process.cwd();
const source = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("reviews-seen counter wiring", () => {
  it("Practitioner.reviewsSeenAt exists in schema + migration", () => {
    expect(source("prisma/schema.prisma")).toContain("reviewsSeenAt");
    expect(source("prisma/migrations/20260609140000_add_practitioner_reviews_seen/migration.sql"))
      .toContain("reviewsSeenAt");
  });

  it("the reviews page stamps reviewsSeenAt on view", () => {
    const page = source("src/app/cabinet/practitioner/reviews/page.tsx");
    expect(page).toMatch(/reviewsSeenAt:\s*new Date\(\)/);
  });

  it("the cabinet layout counts reviews created AFTER last seen (gt), not a fixed window", () => {
    const layout = source("src/app/cabinet/layout.tsx");
    expect(layout).toContain("reviewsSeenAt");
    // count uses a strict greater-than against the resolved cutoff
    expect(layout).toMatch(/createdAt:\s*\{\s*gt:\s*reviewsSince\s*\}/);
  });
});

// Replicates the inline cutoff resolution from the layout to lock its behavior.
function resolveReviewsSince(reviewsSeenAt: Date | null, now: Date): Date {
  const since = new Date(now);
  since.setDate(since.getDate() - 14);
  return reviewsSeenAt && reviewsSeenAt > since ? reviewsSeenAt : since;
}

describe("review cutoff resolution", () => {
  const now = new Date("2026-06-09T12:00:00.000Z");

  it("falls back to a 14-day window when never viewed", () => {
    const cutoff = resolveReviewsSince(null, now);
    expect(cutoff).toEqual(new Date("2026-05-26T12:00:00.000Z"));
  });

  it("uses the last-seen time once the practitioner has viewed recently", () => {
    const seen = new Date("2026-06-08T09:00:00.000Z");
    expect(resolveReviewsSince(seen, now)).toEqual(seen);
  });

  it("a review just viewed (seen=now) yields a cutoff that excludes older reviews", () => {
    const cutoff = resolveReviewsSince(now, now);
    // reviews created before now are NOT newer than the cutoff → badge clears
    expect(cutoff.getTime()).toBe(now.getTime());
  });

  it("never surfaces reviews older than 14 days even if last-seen is stale", () => {
    const stale = new Date("2026-04-01T00:00:00.000Z"); // older than 14d
    const cutoff = resolveReviewsSince(stale, now);
    expect(cutoff).toEqual(new Date("2026-05-26T12:00:00.000Z"));
  });
});
