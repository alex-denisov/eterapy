import { metaDeletionConfirmed } from "@/lib/marketing/meta-webhooks";

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  const confirmed = await metaDeletionConfirmed(code);
  return Response.json(
    confirmed
      ? { status: "completed", message: "The ETerapy Instagram connection and its stored access token have been deleted." }
      : { status: "not_found", message: "Deletion request was not found." },
    { status: confirmed ? 200 : 404 },
  );
}
