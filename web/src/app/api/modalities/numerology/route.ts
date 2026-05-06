import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Старый платный инструмент заменён question-first диалогом ETerapy v5.",
      redirectTo: "/all-modalities/checkin?source=legacy-numerology-api",
    },
    { status: 410 },
  );
}
