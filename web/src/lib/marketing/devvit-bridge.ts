import db from "@/lib/db";
import { timingSafeEqualString } from "@/lib/ops-secret";

const DAY_MS = 86_400_000;

export type DevvitPublicationCommand = {
  publicationId: string;
  type: "POST" | "COMMENT";
  title: string;
  body: string;
  subreddit: string;
  targetId: string | null;
};

export type DevvitPublicationResult = {
  publicationId: string;
  status: "PUBLISHED" | "FAILED";
  externalPostId?: string;
  publicUrl?: string;
  error?: string;
};

function normalizedSubreddit(value: string | undefined | null): string | null {
  const normalized = value?.trim().replace(/^r\//i, "");
  return normalized ? normalized.toLocaleLowerCase("en-US") : null;
}

export function devvitBridgeEnabled(env: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  return env.REDDIT_DEVVIT_ENABLED === "1" || env.REDDIT_DEVVIT_ENABLED === "true";
}

export function devvitBridgeAuthorized(
  authorization: string | null,
  env: Partial<NodeJS.ProcessEnv> = process.env,
): boolean {
  const expected = env.REDDIT_DEVVIT_SHARED_SECRET?.trim();
  const provided = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return Boolean(expected && provided && timingSafeEqualString(provided, expected));
}

export function publicationBelongsToSubreddit(
  publication: {
    contentType: string;
    engagementTargetUrl: string | null;
  },
  subreddit: string,
  env: Partial<NodeJS.ProcessEnv> = process.env,
): boolean {
  const expected = normalizedSubreddit(subreddit);
  if (!expected) return false;
  if (publication.contentType === "POST") {
    return normalizedSubreddit(env.REDDIT_POST_SUBREDDIT) === expected;
  }
  if (publication.contentType !== "COMMENT" || !publication.engagementTargetUrl) return false;
  try {
    const url = new URL(publication.engagementTargetUrl);
    if (!/(^|\.)reddit\.com$/i.test(url.hostname)) return false;
    return normalizedSubreddit(url.pathname.match(/^\/r\/([^/]+)/i)?.[1]) === expected;
  } catch {
    return false;
  }
}

export async function devvitPublicationCommands(
  subreddit: string,
  now = new Date(),
): Promise<DevvitPublicationCommand[]> {
  const candidates = await db.externalPublication.findMany({
    where: {
      platform: { equals: "reddit", mode: "insensitive" },
      status: "SCHEDULED",
      OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
    },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
    take: 20,
    select: {
      id: true,
      title: true,
      body: true,
      contentType: true,
      engagementTargetId: true,
      engagementTargetUrl: true,
    },
  });

  return candidates
    .filter((publication) => (
      Boolean(publication.body?.trim())
      && publicationBelongsToSubreddit(publication, subreddit)
      && (
        publication.contentType === "POST"
        || /^t[13]_[a-z0-9]+$/i.test(publication.engagementTargetId ?? "")
      )
    ))
    .slice(0, 5)
    .map((publication) => ({
      publicationId: publication.id,
      type: publication.contentType as "POST" | "COMMENT",
      title: publication.title.slice(0, 300),
      body: publication.body!.trim(),
      subreddit: normalizedSubreddit(subreddit)!,
      targetId: publication.engagementTargetId,
    }));
}

function validRedditUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)reddit\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export async function recordDevvitPublicationResult(
  subreddit: string,
  result: DevvitPublicationResult,
  now = new Date(),
): Promise<"updated" | "idempotent" | "conflict" | "not_found"> {
  const publication = await db.externalPublication.findUnique({
    where: { id: result.publicationId },
    select: {
      id: true,
      platform: true,
      status: true,
      contentType: true,
      engagementTargetUrl: true,
      externalPostId: true,
      publicUrl: true,
    },
  });
  if (!publication || publication.platform.toLocaleLowerCase("en-US") !== "reddit") {
    return "not_found";
  }
  if (!publicationBelongsToSubreddit(publication, subreddit)) return "not_found";
  if (
    publication.status === "PUBLISHED"
    && result.status === "PUBLISHED"
    && publication.externalPostId === result.externalPostId
    && publication.publicUrl === result.publicUrl
  ) {
    return "idempotent";
  }
  if (publication.status !== "SCHEDULED") return "conflict";

  if (result.status === "PUBLISHED") {
    if (
      !result.externalPostId
      || !result.publicUrl
      || !validRedditUrl(result.publicUrl)
    ) {
      return "conflict";
    }
    await db.externalPublication.update({
      where: { id: publication.id },
      data: {
        status: "PUBLISHED",
        externalPostId: result.externalPostId,
        publicUrl: result.publicUrl,
        publishedAt: now,
        nextReviewAt: new Date(now.getTime() + 7 * DAY_MS),
        attemptCount: { increment: 1 },
        lastError: null,
      },
    });
    return "updated";
  }

  await db.externalPublication.update({
    where: { id: publication.id },
    data: {
      status: "FAILED",
      attemptCount: { increment: 1 },
      lastError: (result.error?.trim() || "Devvit publication failed").slice(0, 500),
    },
  });
  return "updated";
}
