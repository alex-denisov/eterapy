import { disconnectMetaPlatform, verifyMetaSignedRequest } from "@/lib/marketing/meta-webhooks";

export async function POST(request: Request) {
  const form = await request.formData();
  const signedRequest = form.get("signed_request");
  if (typeof signedRequest !== "string") return Response.json({ error: "Missing signed_request" }, { status: 400 });
  const payload = await verifyMetaSignedRequest("Threads", signedRequest).catch(() => null);
  if (!payload?.user_id) return Response.json({ error: "Invalid signature" }, { status: 403 });
  await disconnectMetaPlatform("Threads");
  return Response.json({ success: true });
}
