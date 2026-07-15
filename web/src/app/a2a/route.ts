import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { platformOverview, publicAgentResources } from "@/lib/agent-readiness";
import { authRateLimitResponse, checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string().max(100), z.number()]),
  method: z.enum(["message/send", "SendMessage"]),
  params: z.object({
    message: z.object({
      messageId: z.string().max(100).optional(),
      role: z.literal("user"),
      parts: z.array(z.object({
        kind: z.literal("text"),
        text: z.string().max(500),
      })).min(1).max(5),
    }),
  }),
});

function answerFor(text: string) {
  const normalized = text.toLocaleLowerCase("ru");
  const matchingResource = publicAgentResources.find((resource) =>
    normalized.includes(resource.title.toLocaleLowerCase("ru").split(" ")[0]),
  );
  if (matchingResource) {
    return `${matchingResource.description} Канонический источник: ${matchingResource.url}`;
  }

  const overview = platformOverview();
  return `${overview.description} Первый разбор доступен без регистрации и оплаты. ETerapy не заменяет профессиональную или экстренную помощь. Подробнее: ${overview.canonicalUrl}/how-it-works`;
}

export async function POST(request: NextRequest) {
  const limit = checkRequestAuthRateLimit(request, "public-a2a", 30, 60_000);
  if (!limit.allowed) return authRateLimitResponse(limit);

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32602, message: "Invalid A2A public-information request" },
    }, { status: 400 });
  }

  const text = parsed.data.params.message.parts.map((part) => part.text).join(" ");
  return Response.json({
    jsonrpc: "2.0",
    id: parsed.data.id,
    result: {
      kind: "message",
      messageId: randomUUID(),
      role: "agent",
      parts: [{ kind: "text", text: answerFor(text) }],
    },
  });
}
