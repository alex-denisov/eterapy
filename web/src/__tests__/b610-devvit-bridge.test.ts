/**
 * @jest-environment node
 */
const findMany = jest.fn();
const findUnique = jest.fn();
const update = jest.fn();

jest.mock("@/lib/db", () => {
  const db = {
    externalPublication: { findMany, findUnique, update },
  };
  return { __esModule: true, db, default: db };
});

import {
  devvitBridgeAuthorized,
  devvitPublicationCommands,
  publicationBelongsToSubreddit,
  recordDevvitPublicationResult,
} from "@/lib/marketing/devvit-bridge";

describe("B610 · installation-scoped Devvit bridge", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REDDIT_POST_SUBREDDIT = "r/eterapy";
    process.env.REDDIT_DEVVIT_SHARED_SECRET = "bridge-test-secret";
  });

  it("authenticates the shared bearer secret without a plaintext fallback", () => {
    expect(devvitBridgeAuthorized("Bearer bridge-test-secret")).toBe(true);
    expect(devvitBridgeAuthorized("Bearer wrong")).toBe(false);
    expect(devvitBridgeAuthorized(null)).toBe(false);
  });

  it("accepts only records belonging to the current installation", () => {
    expect(publicationBelongsToSubreddit({
      contentType: "POST",
      engagementTargetUrl: null,
    }, "eterapy")).toBe(true);
    expect(publicationBelongsToSubreddit({
      contentType: "COMMENT",
      engagementTargetUrl: "https://www.reddit.com/r/eterapy/comments/abc/post/",
    }, "eterapy")).toBe(true);
    expect(publicationBelongsToSubreddit({
      contentType: "COMMENT",
      engagementTargetUrl: "https://www.reddit.com/r/another/comments/abc/post/",
    }, "eterapy")).toBe(false);
    expect(publicationBelongsToSubreddit({
      contentType: "COMMENT",
      engagementTargetUrl: "https://evil.example/r/eterapy/comments/abc/post/",
    }, "eterapy")).toBe(false);
  });

  it("returns only due valid commands and caps each poll", async () => {
    findMany.mockResolvedValue([
      {
        id: "post-1",
        title: "Title",
        body: "Body",
        contentType: "POST",
        engagementTargetId: null,
        engagementTargetUrl: null,
      },
      {
        id: "comment-1",
        title: "Reply",
        body: "Comment",
        contentType: "COMMENT",
        engagementTargetId: "t3_abc123",
        engagementTargetUrl: "https://www.reddit.com/r/eterapy/comments/abc123/post/",
      },
      {
        id: "comment-invalid",
        title: "Reply",
        body: "Comment",
        contentType: "COMMENT",
        engagementTargetId: "invalid",
        engagementTargetUrl: "https://www.reddit.com/r/eterapy/comments/abc123/post/",
      },
    ]);

    await expect(devvitPublicationCommands("eterapy"))
      .resolves.toEqual([
        expect.objectContaining({ publicationId: "post-1", type: "POST", subreddit: "eterapy" }),
        expect.objectContaining({ publicationId: "comment-1", type: "COMMENT", targetId: "t3_abc123" }),
      ]);
  });

  it("records a successful result once and accepts an identical replay", async () => {
    findUnique
      .mockResolvedValueOnce({
        id: "post-1",
        platform: "reddit",
        status: "SCHEDULED",
        contentType: "POST",
        engagementTargetUrl: null,
        externalPostId: null,
        publicUrl: null,
      })
      .mockResolvedValueOnce({
        id: "post-1",
        platform: "reddit",
        status: "PUBLISHED",
        contentType: "POST",
        engagementTargetUrl: null,
        externalPostId: "t3_published",
        publicUrl: "https://www.reddit.com/r/eterapy/comments/published/",
      });
    update.mockResolvedValue({});
    const result = {
      publicationId: "post-1",
      status: "PUBLISHED" as const,
      externalPostId: "t3_published",
      publicUrl: "https://www.reddit.com/r/eterapy/comments/published/",
    };

    await expect(recordDevvitPublicationResult("eterapy", result)).resolves.toBe("updated");
    await expect(recordDevvitPublicationResult("eterapy", result)).resolves.toBe("idempotent");
    expect(update).toHaveBeenCalledTimes(1);
  });
});
