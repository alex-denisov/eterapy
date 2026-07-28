import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import db from "@/lib/db";
import { requiredMarketingPlatformValue } from "@/lib/marketing/platform-settings";
import type { MetaMarketingPlatform } from "@/lib/marketing/meta-oauth";

function safeEqual(left: Buffer, right: Buffer) {
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function verifyMetaSignedRequest(
  platform: MetaMarketingPlatform,
  signedRequest: string,
) {
  const [encodedSignature, payload] = signedRequest.split(".");
  if (!encodedSignature || !payload) return null;
  const secret = await requiredMarketingPlatformValue(
    platform === "Threads" ? "THREADS_APP_SECRET" : "INSTAGRAM_APP_SECRET",
  );
  const expected = createHmac("sha256", secret).update(payload).digest();
  const actual = Buffer.from(encodedSignature, "base64url");
  if (!safeEqual(expected, actual)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      user_id?: string | number;
      algorithm?: string;
    };
    if (value.algorithm?.toUpperCase() !== "HMAC-SHA256") return null;
    return value;
  } catch {
    return null;
  }
}

export async function disconnectMetaPlatform(platform: MetaMarketingPlatform) {
  const keys = platform === "Threads"
    ? ["THREADS_ACCESS_TOKEN", "THREADS_USER_ID", "THREADS_TOKEN_EXPIRES_AT"]
    : ["INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_USER_ID", "INSTAGRAM_TOKEN_EXPIRES_AT"];
  await db.$transaction([
    db.platformSetting.deleteMany({
      where: { key: { in: keys.map((key) => `marketing.connector.${key}`) } },
    }),
    db.platformSetting.upsert({
      where: { key: `marketing.connector.${platform.toLowerCase()}.enabled` },
      create: {
        key: `marketing.connector.${platform.toLowerCase()}.enabled`,
        value: "false",
        updatedBy: "meta-callback",
      },
      update: { value: "false", updatedBy: "meta-callback" },
    }),
  ]);
}

export async function createMetaDeletionConfirmation() {
  const code = randomBytes(24).toString("base64url");
  const digest = createHash("sha256").update(code).digest("hex");
  await db.platformSetting.upsert({
    where: { key: `marketing.meta.deletion.${digest}` },
    create: {
      key: `marketing.meta.deletion.${digest}`,
      value: new Date().toISOString(),
      updatedBy: "meta-callback",
    },
    update: { value: new Date().toISOString(), updatedBy: "meta-callback" },
  });
  return code;
}

export async function metaDeletionConfirmed(code: string) {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(code)) return false;
  const digest = createHash("sha256").update(code).digest("hex");
  return Boolean(await db.platformSetting.findUnique({
    where: { key: `marketing.meta.deletion.${digest}` },
    select: { key: true },
  }));
}

export async function verifyInstagramWebhookSignature(rawBody: string, signature: string | null) {
  if (!signature?.startsWith("sha256=")) return false;
  const secret = await requiredMarketingPlatformValue("INSTAGRAM_APP_SECRET");
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(signature.slice("sha256=".length), "hex"),
  );
}
