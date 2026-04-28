import { z } from "zod";
import { getSetting, setSetting } from "@/lib/platform-settings";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const quietHoursSchema = z.object({
  enabled: z.boolean(),
  from: timeSchema,
  to: timeSchema,
  timezone: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_+\-/]+$/),
});

export type QuietHours = z.infer<typeof quietHoursSchema>;

export function quietHoursKey(userId: string) {
  return `notification.quiet_hours.${userId}`;
}

export function defaultQuietHours(timezone?: string | null): QuietHours {
  return {
    enabled: false,
    from: "22:00",
    to: "09:00",
    timezone: timezone || "Europe/Moscow",
  };
}

export function parseQuietHours(value: string, timezone?: string | null): QuietHours {
  if (!value) return defaultQuietHours(timezone);
  try {
    const parsed = quietHoursSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : defaultQuietHours(timezone);
  } catch {
    return defaultQuietHours(timezone);
  }
}

export async function getUserQuietHours(userId: string, timezone?: string | null) {
  return parseQuietHours(await getSetting(quietHoursKey(userId)), timezone);
}

export async function setUserQuietHours(userId: string, quietHours: QuietHours) {
  await setSetting(quietHoursKey(userId), JSON.stringify(quietHours), userId);
}

function minutesFromTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find(part => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find(part => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function getQuietHoursDelayMs(quietHours: QuietHours, now = new Date()) {
  if (!quietHours.enabled) return 0;

  const current = minutesInTimezone(now, quietHours.timezone);
  const from = minutesFromTime(quietHours.from);
  const to = minutesFromTime(quietHours.to);
  const active = from < to
    ? current >= from && current < to
    : current >= from || current < to;

  if (!active) return 0;

  const minutesUntilEnd = current < to
    ? to - current
    : (24 * 60 - current) + to;

  return minutesUntilEnd * 60_000;
}
