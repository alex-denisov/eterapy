import {
  handleMetaWebhookDelivery,
  handleMetaWebhookVerification,
} from "@/lib/marketing/meta-webhook-handlers";

export async function GET(request: Request) {
  return handleMetaWebhookVerification("Instagram", request);
}

export async function POST(request: Request) {
  return handleMetaWebhookDelivery("Instagram", request);
}
