import Link from "next/link";
import { appUrl } from "@/lib/subdomain";

// B466 — «Календарь» switcher: Расписание · Заявки · Доступность (mockups
// -calendar-schedule / -requests / -availability). URL-addressable (?tab=).

export type CalendarTabKey = "schedule" | "requests" | "availability";

export const CALENDAR_TABS: Array<{ key: CalendarTabKey; label: string }> = [
  { key: "schedule", label: "Расписание" },
  { key: "requests", label: "Заявки" },
  { key: "availability", label: "Доступность" },
];

export function CalendarTabs({ active, requestCount }: { active: CalendarTabKey; requestCount: number }) {
  return (
    <div
      className="mt-5 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-1"
      data-testid="practitioner-calendar-tabs"
    >
      {CALENDAR_TABS.map((tab) => (
        <Link
          key={tab.key}
          href={appUrl(`/practitioner/calendar?tab=${tab.key}`)}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            active === tab.key ? "soft-select-pill" : "text-[var(--soft-ink-soft)] hover:text-foreground"
          }`}
          aria-current={active === tab.key ? "page" : undefined}
        >
          {tab.label}
          {tab.key === "requests" && requestCount > 0 && (
            <span
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums"
              style={{ background: "var(--soft-apricot, #F4D9C1)", color: "var(--soft-bordeaux)" }}
              data-testid="practitioner-requests-badge"
            >
              {requestCount > 99 ? "99+" : requestCount}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
