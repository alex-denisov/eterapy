import {
  createMetaDeletionConfirmation,
  disconnectMetaPlatform,
  verifyMetaSignedRequest,
} from "@/lib/marketing/meta-webhooks";

export async function POST(request: Request) {
  const form = await request.formData();
  const signedRequest = form.get("signed_request");
  if (typeof signedRequest !== "string") return Response.json({ error: "Missing signed_request" }, { status: 400 });
  const instagramPayload = await verifyMetaSignedRequest("Instagram", signedRequest).catch(() => null);
  const threadsPayload = instagramPayload?.user_id
    ? null
    : await verifyMetaSignedRequest("Threads", signedRequest).catch(() => null);
  if (!instagramPayload?.user_id && !threadsPayload?.user_id) {
    return Response.json({ error: "Invalid signature" }, { status: 403 });
  }
  await disconnectMetaPlatform(instagramPayload?.user_id ? "Instagram" : "Threads");
  const confirmationCode = await createMetaDeletionConfirmation();
  return Response.json({
    url: `https://eterapy.com/api/integrations/meta/data-deletion/status?code=${encodeURIComponent(confirmationCode)}`,
    confirmation_code: confirmationCode,
  });
}
