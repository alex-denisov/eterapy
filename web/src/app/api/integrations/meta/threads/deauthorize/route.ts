import { disconnectMetaPlatform, verifyMetaSignedRequest } from "@/lib/marketing/meta-webhooks";

export async function POST(request: Request) {
  // B756: пустой или не форменный POST — это 400, а не 500 (Meta и сканеры шлют такое).
  const form = await request.formData().catch(() => null);
  const signedRequest = form?.get("signed_request");
  if (typeof signedRequest !== "string") return Response.json({ error: "Missing signed_request" }, { status: 400 });
  const payload = await verifyMetaSignedRequest("Threads", signedRequest).catch(() => null);
  if (!payload?.user_id) return Response.json({ error: "Invalid signature" }, { status: 403 });
  await disconnectMetaPlatform("Threads");
  return Response.json({ success: true });
}
