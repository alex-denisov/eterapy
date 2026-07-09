import Link from "next/link";
import { Download, Pencil, Target, TrendingUp } from "lucide-react";
import db from "@/lib/db";
import { parseCarePlanGoals } from "@/lib/care-plan";
import { appUrl } from "@/lib/subdomain";

// B466 R9-4 P2 — вкладка «План» мобильной карточки клиента, 1-в-1 по
// docs/Design/mockups/practitioner-client-plan.html (и therapy-plan.html):
// ai-note → цели с прогресс-барами → методы (× и «+ метод» ведут в
// редактирование) → фокус следующей сессии → actionbar (Экспорт PRO+ —
// зарезервирован, пока disabled · Редактировать план).

function SparkGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <path d="M12 2.6l1.9 5.1 5.1 1.9-5.1 1.9L12 16.6l-1.9-5.1L5 9.6l5.1-1.9z" />
    </svg>
  );
}

export async function CardMobilePlan({
  practitionerId,
  clientId,
  completedCount,
}: {
  practitionerId: string;
  clientId: string;
  completedCount: number;
}) {
  const plan = await db.clientCarePlan.findUnique({
    where: { practitionerId_clientId: { practitionerId, clientId } },
    select: { goals: true, methods: true, nextFocus: true, aiSuggestion: true },
  });
  const goals = parseCarePlanGoals(plan?.goals);
  const editHref = appUrl(`/practitioner/clients/${clientId}/plan/edit`);

  if (!plan || (goals.length === 0 && plan.methods.length === 0 && plan.nextFocus.length === 0)) {
    return (
      <div data-testid="client-card-plan-empty-mobile">
        <div className="pcab-ainote">
          <SparkGlyph />
          AI предлагает обновление плана после каждой сессии — вы подтверждаете
        </div>
        <div className="pcab-card r16" style={{ marginTop: 16, textAlign: "center", padding: "22px 16px" }}>
          <p className="pcab-empty-t" style={{ marginTop: 0 }}>Плана сопровождения ещё нет</p>
          <p className="pcab-empty-s" style={{ margin: "8px auto 0" }}>
            Задайте цели и методы работы — после каждой сессии AI будет предлагать обновления, а вы подтверждать.
          </p>
          <div className="pcab-actionbar" style={{ marginTop: 16 }}>
            <Link href={editHref} className="pcab-abtn pcab-abtn-primary">
              Создать план
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const activeGoals = goals.filter((g) => g.status !== "done");

  return (
    <div data-testid="client-card-plan-mobile">
      <div className="pcab-ainote">
        <SparkGlyph />
        AI предлагает обновление плана после каждой сессии — вы подтверждаете
      </div>

      {plan.aiSuggestion != null && (
        <Link href={editHref} className="pcab-aibanner" style={{ display: "flex" }} data-testid="plan-ai-banner-mobile">
          <SparkGlyph size={16} />
          <span>
            <span className="pcab-aibanner-t" style={{ display: "block" }}>AI предложил обновления после сессии</span>
            <span className="pcab-aibanner-s" style={{ display: "block" }}>
              Проверьте и подтвердите: предложения из разбора, но решаете вы.
            </span>
          </span>
        </Link>
      )}

      {/* Цели */}
      <div className="pcab-section-head" style={{ margin: "20px 0 4px" }}>
        <span className="pcab-eyebrow">
          Цели · {activeGoals.length} {activeGoals.length === 1 ? "активная" : "активные"}
        </span>
      </div>
      {goals.map((goal) => (
        <div key={goal.id} className="pcab-goal" data-testid="client-plan-goal-mobile">
          <div className="pcab-goal-top">
            <span className="pcab-goal-t">{goal.title}</span>
            <span className="pcab-goal-pct">{goal.progress}%</span>
          </div>
          <div className="pcab-bar">
            <div className="pcab-bar-fill" style={{ width: `${goal.progress}%` }} />
          </div>
          {goal.status === "new" ? (
            <div className="pcab-goal-meta">
              <span className="pcab-gtag">новая</span>
              добавлена недавно
            </div>
          ) : goal.status === "done" ? (
            <div className="pcab-goal-meta up">
              <TrendingUp width={12} height={12} strokeWidth={2.2} aria-hidden="true" />
              цель достигнута
            </div>
          ) : (
            <div className="pcab-goal-meta">в работе</div>
          )}
        </div>
      ))}

      {/* Методы */}
      {plan.methods.length > 0 && (
        <>
          <div className="pcab-section-head" style={{ margin: "20px 0 4px" }}>
            <span className="pcab-eyebrow">Методы</span>
          </div>
          <p className="pcab-cap" style={{ margin: "-2px 0 9px" }}>
            AI выделяет применённые методы из сессий — вы правите и дополняете
          </p>
          <div className="pcab-methods" style={{ marginTop: 6 }}>
            {plan.methods.map((method) => (
              <Link key={method} href={editHref} className="pcab-tchip" style={{ padding: "7px 12px" }}>
                {method}
                <span className="pcab-chip-x" aria-hidden="true">×</span>
              </Link>
            ))}
            <Link href={editHref} className="pcab-tchip add" style={{ padding: "7px 12px" }}>
              + метод
            </Link>
          </div>
        </>
      )}

      {/* Фокус следующей сессии */}
      {plan.nextFocus.length > 0 && (
        <>
          <div className="pcab-section-head" style={{ margin: "20px 0 4px" }}>
            <span className="pcab-eyebrow">Фокус следующей сессии</span>
          </div>
          <div className="pcab-focus">
            <div className="pcab-focus-t">
              <Target width={15} height={15} strokeWidth={2} style={{ color: "var(--pc-bordeaux)" }} aria-hidden="true" />
              {completedCount + 1}-я сессия
            </div>
            <ul className="pcab-focus-list">
              {plan.nextFocus.map((item) => (
                <li key={item}>
                  <span className="pcab-focus-dot" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {/* actionbar: Экспорт (PRO+, зарезервирован) + Редактировать план */}
      <div className="pcab-actionbar">
        <button
          type="button"
          className="pcab-abtn pcab-abtn-ghost"
          aria-disabled="true"
          disabled
          title="Экспорт плана появится в тарифе Pro+"
          style={{ opacity: 0.7 }}
        >
          <span className="pcab-protag">PRO+</span>
          <Download width={16} height={16} strokeWidth={2} aria-hidden="true" />
          Экспорт
        </button>
        <Link href={editHref} className="pcab-abtn pcab-abtn-primary" data-testid="client-plan-edit-link-mobile">
          <Pencil width={16} height={16} strokeWidth={2} aria-hidden="true" />
          Редактировать план
        </Link>
      </div>
    </div>
  );
}
