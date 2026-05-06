import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Старый платный инструмент заменён question-first диалогом ETerapy v5.",
      redirectTo: "/checkin?source=legacy-horoscope-api",
    },
    { status: 410 },
  );
}
