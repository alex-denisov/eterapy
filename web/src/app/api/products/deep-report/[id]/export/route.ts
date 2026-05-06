import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const result = await db.productResult.findFirst({
    where: {
      id,
      userId,
      productKey: "deep-report",
      status: "READY",
      deletedAt: null,
    },
  });
  if (!result?.resultText) {
    return new Response("Deep report not found", { status: 404 });
  }

  await db.productResult.update({
    where: { id: result.id },
    data: { exportedAt: new Date() },
  });

  return new Response(`${result.title}\n\n${result.resultText}`, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="eterapy-deep-report-${result.id}.txt"`,
      "Cache-Control": "no-store",
    },
  });
}
