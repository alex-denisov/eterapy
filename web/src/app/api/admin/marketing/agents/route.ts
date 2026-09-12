/**
 * B740 — ОДНО ОКНО В СОСТОЯНИЕ ОБОИХ АГЕНТОВ.
 *
 * Отчёты оркестратора уходят в Telegram, и этого достаточно, чтобы УЗНАТЬ о
 * проблеме. Недостаточно, чтобы её РАЗОБРАТЬ: в сообщении нет ни списка
 * выпущенных страниц, ни того, что именно правилось и что стояло до правки.
 * Раньше такой разбор означал бы поход в базу прода руками.
 *
 * Ручка только читает. Менять состояние отсюда нельзя намеренно: у правок есть
 * свой путь — через оркестратора, со следом в `agent_directives` и отчётом
 * владельцу ДО применения. Вторая дорога к тем же настройкам обесценила бы этот
 * след, потому что часть изменений появлялась бы в базе без строки и без
 * доклада.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { diagnose } from "@/lib/marketing/orchestrator-diagnosis";
import { collectOrchestratorState } from "@/lib/marketing/orchestrator-state";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const [state, pages, directives, candidates] = await Promise.all([
    collectOrchestratorState({ now }),
    db.seoLibraryPage.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        slug: true,
        status: true,
        topic: true,
        targetQuery: true,
        targetDemand: true,
        demandSource: true,
        ctaProduct: true,
        writerModel: true,
        reviewerModel: true,
        reviewRounds: true,
        publishedAt: true,
        submittedAt: true,
      },
    }).catch(() => []),
    db.agentDirective.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        key: true,
        target: true,
        action: true,
        status: true,
        risk: true,
        problem: true,
        rationale: true,
        payload: true,
        previous: true,
        reportedAt: true,
        appliedAt: true,
        failedReason: true,
      },
    }).catch(() => []),
    // Верхушка очереди спроса — по ней видно, чем агент займётся дальше.
    db.seoKeywordCandidate.findMany({
      where: { status: "NEW" },
      orderBy: [{ monthlyDemand: "desc" }, { growth: "desc" }],
      take: 15,
      select: { displayPhrase: true, monthlyDemand: true, growth: true, source: true, cluster: true },
    }).catch(() => []),
  ]);

  return NextResponse.json({
    checkedAt: now.toISOString(),
    // Диагноз считается тем же кодом, что и в отчёте: расхождение между
    // экраном и сообщением в Telegram означало бы, что одному из них нельзя
    // верить, а какому именно — неизвестно.
    findings: diagnose(state),
    conveyor: state.conveyor,
    providers: state.providers,
    platforms: state.platforms,
    seo: state.seo,
    search: state.search,
    pages,
    directives,
    queue: candidates,
  });
}
