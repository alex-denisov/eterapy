import {
  handleMetaWebhookDelivery,
  handleMetaWebhookVerification,
} from "@/lib/marketing/meta-webhook-handlers";

// B618: у Threads свой webhook и свой секрет приложения. Адрес добавляется в
// Meta App отдельно от Instagram — один и тот же URL площадки не разделяют.
export async function GET(request: Request) {
  return handleMetaWebhookVerification("Threads", request);
}

export async function POST(request: Request) {
  return handleMetaWebhookDelivery("Threads", request);
}
