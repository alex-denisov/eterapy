import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupportOperatorAccess } from "@/lib/admin-support-access";
import { logAudit } from "@/lib/audit";
import db from "@/lib/db";

const replySchema = z.object({ content: z.string().trim().min(1).max(2000) });
const statusSchema = z.object({ status: z.enum(["OPEN", "CLOSED"]) });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getSupportOperatorAccess();
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const sinceParam = request.nextUrl.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : null;
  const validSince = since && !Number.isNaN(since.getTime()) ? since : null;
  const conversation = await db.supportConversation.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      subject: true,
      createdAt: true,
      closedAt: true,
      user: { select: { id: true, name: true, email: true, role: true } },
      messages: {
        where: validSince ? { createdAt: { gt: validSince } } : undefined,
        orderBy: { createdAt: "asc" },
        take: 500,
        select: { id: true, role: true, content: true, createdAt: true },
      },
    },
  });
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    conversation: {
      ...conversation,
      createdAt: conversation.createdAt.toISOString(),
      closedAt: conversation.closedAt?.toISOString() ?? null,
      messages: conversation.messages.map((message) => ({
        ...message,
        createdAt: message.createdAt.toISOString(),
      })),
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getSupportOperatorAccess();
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = replySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Сообщение должно содержать от 1 до 2000 символов" }, { status: 400 });
  }

  const { id } = await params;
  const conversation = await db.supportConversation.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true },
  });
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (conversation.status !== "OPEN") {
    return NextResponse.json({ error: "Сначала переоткройте обращение" }, { status: 409 });
  }

  const message = await db.$transaction(async (tx) => {
    const created = await tx.supportMessage.create({
      data: { conversationId: id, role: "STAFF", content: parsed.data.content },
      select: { id: true, role: true, content: true, createdAt: true },
    });
    await tx.supportConversation.update({ where: { id }, data: { status: "OPEN" } });
    return created;
  });

  await logAudit(
    access.userId,
    "SUPPORT_REPLY",
    conversation.userId,
    JSON.stringify({ conversationId: id, messageId: message.id }),
  );

  return NextResponse.json({
    message: { ...message, createdAt: message.createdAt.toISOString() },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getSupportOperatorAccess();
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = statusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  const { id } = await params;
  const current = await db.supportConversation.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true },
  });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const closedAt = parsed.data.status === "CLOSED" ? new Date() : null;
  await db.supportConversation.update({
    where: { id },
    data: { status: parsed.data.status, closedAt },
  });
  await logAudit(
    access.userId,
    "SUPPORT_STATUS_CHANGE",
    current.userId,
    JSON.stringify({ conversationId: id, from: current.status, to: parsed.data.status }),
  );

  return NextResponse.json({ status: parsed.data.status, closedAt: closedAt?.toISOString() ?? null });
}
