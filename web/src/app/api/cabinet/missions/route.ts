import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listMissionChecklist } from "@/lib/missions";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const checklist = await listMissionChecklist(session.user.id);
  return NextResponse.json({ checklist });
}
