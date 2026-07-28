/**
 * B616 — human-paced engagement plan.
 *
 * The owner asked the SMM agent to behave like a person who actually reads
 * social networks: not one scripted comment per cron tick, but several visits
 * a day at uneven times, each producing a small burst of replies.
 *
 * The plan is therefore modelled as *sessions*, not as a fixed cron. Every
 * (platform, Moscow date) pair derives a deterministic but irregular set of
 * visit times, so a worker restart never doubles or shifts the day's slots and
 * two nodes computing the same day agree on the same schedule.
 */

export type EngagementPlatform = "vk" | "reddit" | "threads";

export const ENGAGEMENT_PLATFORMS: readonly EngagementPlatform[] = ["vk", "reddit", "threads"];

/**
 * Owner requirement: at least five comments per network per day. Volume above
 * the floor is allowed when enough genuinely relevant posts are found, but the
 * agent never invents targets just to reach a number.
 */
export const ENGAGEMENT_DAILY_MINIMUM = 5;
export const ENGAGEMENT_DAILY_MAXIMUM = 9;

type ActiveWindow = { startMinute: number; endMinute: number };

/**
 * Moscow-local windows in which a real reader of that network is plausibly
 * online. Reddit skews later because the target subreddits are mixed-timezone.
 */
const ACTIVE_WINDOWS: Record<EngagementPlatform, ActiveWindow> = {
  vk: { startMinute: 9 * 60 + 20, endMinute: 23 * 60 + 10 },
  reddit: { startMinute: 12 * 60, endMinute: 25 * 60 + 30 },
  threads: { startMinute: 10 * 60, endMinute: 23 * 60 + 40 },
};

export function moscowDateKey(value: Date): string {
  const shifted = new Date(value.getTime() + 3 * 60 * 60_000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function seed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic 0..1 stream derived from a stable string seed. */
function randomStream(value: string): () => number {
  let state = seed(value) || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

function minuteToInstant(dateKey: string, minute: number): Date {
  // Moscow is UTC+3 all year, so a Moscow wall-clock minute maps directly.
  // Minutes beyond 1440 deliberately roll into the small hours of the next
  // day, which is where late Reddit activity actually happens.
  const midnight = new Date(`${dateKey}T00:00:00.000+03:00`).getTime();
  return new Date(midnight + minute * 60_000);
}

export interface EngagementSession {
  index: number;
  startsAt: Date;
  slots: Date[];
}

/**
 * Two to four reading sessions per day, each producing one to three replies.
 * Session starts are spread across the active window with per-day jitter, and
 * replies inside a session are three to fourteen minutes apart.
 */
export function engagementSessionsFor(
  platform: EngagementPlatform,
  now: Date,
): EngagementSession[] {
  const dateKey = moscowDateKey(now);
  const random = randomStream(`${platform}:${dateKey}`);
  const window = ACTIVE_WINDOWS[platform];
  const span = window.endMinute - window.startMinute;
  const sessionCount = 2 + Math.floor(random() * 3);
  const sessions: EngagementSession[] = [];
  let produced = 0;

  for (let index = 0; index < sessionCount; index += 1) {
    const share = span / sessionCount;
    const jitter = Math.floor(random() * Math.max(1, share * 0.55));
    const startMinute = Math.round(window.startMinute + share * index + jitter);
    const remainingSessions = sessionCount - index;
    const stillNeeded = Math.max(0, ENGAGEMENT_DAILY_MINIMUM - produced);
    const minimumHere = Math.ceil(stillNeeded / remainingSessions);
    const burst = Math.min(
      3,
      Math.max(minimumHere, 1 + Math.floor(random() * 3)),
      ENGAGEMENT_DAILY_MAXIMUM - produced,
    );
    const slots: Date[] = [];
    let cursor = startMinute;
    for (let slotIndex = 0; slotIndex < burst; slotIndex += 1) {
      slots.push(minuteToInstant(dateKey, cursor));
      cursor += 3 + Math.floor(random() * 12);
    }
    produced += slots.length;
    sessions.push({ index, startsAt: minuteToInstant(dateKey, startMinute), slots });
  }

  return sessions;
}

export function engagementSlotsFor(platform: EngagementPlatform, now: Date): Date[] {
  return engagementSessionsFor(platform, now)
    .flatMap((session) => session.slots)
    .sort((left, right) => left.getTime() - right.getTime());
}

export function engagementDailyTarget(platform: EngagementPlatform, now: Date): number {
  return engagementSlotsFor(platform, now).length;
}

/**
 * Slots that are still free today. `taken` holds the times already assigned to
 * existing comment proposals, so a re-run never schedules two replies at the
 * same minute and never back-fills a slot the day has already passed by more
 * than the grace period.
 */
export function openEngagementSlots(input: {
  platform: EngagementPlatform;
  now: Date;
  taken: readonly Date[];
  graceMinutes?: number;
}): Date[] {
  const takenMinutes = new Set(input.taken.map((value) => Math.floor(value.getTime() / 60_000)));
  const grace = (input.graceMinutes ?? 45) * 60_000;
  return engagementSlotsFor(input.platform, input.now).filter((slot) => {
    if (takenMinutes.has(Math.floor(slot.getTime() / 60_000))) return false;
    return slot.getTime() >= input.now.getTime() - grace;
  });
}

/**
 * How many more proposals the agent should create right now. Discovery keeps a
 * small lookahead so an approved comment is ready before its slot, but never
 * front-loads the whole day at once — that would look like a bot.
 */
export function engagementDeficit(input: {
  platform: EngagementPlatform;
  now: Date;
  existingToday: readonly Date[];
  lookaheadMinutes?: number;
}): number {
  const lookahead = (input.lookaheadMinutes ?? 150) * 60_000;
  const horizon = input.now.getTime() + lookahead;
  const open = openEngagementSlots({
    platform: input.platform,
    now: input.now,
    taken: input.existingToday,
  });
  return open.filter((slot) => slot.getTime() <= horizon).length;
}
