import { NextResponse } from "next/server";
import { getSupportOperatorAccess } from "@/lib/admin-support-access";
import db from "@/lib/db";

const LIST_LIMIT = 200;

export async function GET() {
  const access = await getSupportOperatorAccess();
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const conversations = await db.supportConversation.findMany({
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
    select: {
      id: true,
      status: true,
      subject: true,
      createdAt: true,
      closedAt: true,
      user: { select: { id: true, name: true, email: true, role: true } },
      _count: { select: { messages: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { role: true, content: true, createdAt: true },
      },
    },
  });

  const items = conversations
    .map((conversation) => {
      const latest = conversation.messages[0] ?? null;
      return {
        id: conversation.id,
        status: conversation.status,
        subject: conversation.subject,
        createdAt: conversation.createdAt.toISOString(),
        closedAt: conversation.closedAt?.toISOString() ?? null,
        lastActivityAt: (latest?.createdAt ?? conversation.createdAt).toISOString(),
        lastMessageRole: latest?.role ?? null,
        preview: latest?.content.slice(0, 180) ?? "Обращение без сообщений",
        messageCount: conversation._count.messages,
        user: conversation.user,
      };
    })
    .sort((left, right) => {
      if (left.status === "OPEN" && right.status !== "OPEN") return -1;
      if (left.status !== "OPEN" && right.status === "OPEN") return 1;
      return Date.parse(right.lastActivityAt) - Date.parse(left.lastActivityAt);
    });

  return NextResponse.json({ conversations: items });
}
