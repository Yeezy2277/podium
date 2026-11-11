import type { CampaignStatus } from "@podium/shared";
import { conflict, invalid } from "./errors";

/** Brands and prizes freeze this long before start: shoppers may already see the promo. */
export const CONFIG_LOCK_MS = 60 * 60 * 1000;

export type Schedulable = {
  status: CampaignStatus;
  startsAt: Date;
  endsAt: Date;
  scheduleVersion: number;
};

export type Transition = { to: "LIVE" | "ENDED"; at: Date; scheduleVersion: number };

/**
 * The single next automatic transition, if any. One pending task per campaign:
 * when it fires it schedules the one after, so there's never a backlog of
 * stale timers to reconcile.
 */
export function nextTransition(c: Schedulable): Transition | null {
  if (c.status === "SCHEDULED") return { to: "LIVE", at: c.startsAt, scheduleVersion: c.scheduleVersion };
  if (c.status === "LIVE") return { to: "ENDED", at: c.endsAt, scheduleVersion: c.scheduleVersion };
  return null;
}

export type TaskDecision =
  | { kind: "apply"; status: "LIVE" | "ENDED" }
  | { kind: "stale"; reason: string }
  | { kind: "early"; retryAt: Date };

/**
 * Called when a scheduled task fires. Tasks are delivered at least once and
 * may be late, early (clock skew) or obsolete (the campaign was edited after
 * the task was queued). The scheduleVersion check turns an obsolete task into
 * a no-op instead of, say, ending a campaign whose end was just extended.
 */
export function decideTask(c: Schedulable, task: Transition, now: Date): TaskDecision {
  if (task.scheduleVersion !== c.scheduleVersion) return { kind: "stale", reason: "campaign was rescheduled after this task was queued" };
  const expected = nextTransition(c);
  if (!expected || expected.to !== task.to) return { kind: "stale", reason: `campaign is ${c.status}, not awaiting ${task.to}` };
  if (now < expected.at) return { kind: "early", retryAt: expected.at };
  return { kind: "apply", status: task.to };
}

/** DRAFT → SCHEDULED. Refuses a start in the past rather than silently going live. */
export function schedule(c: Schedulable, now: Date): Schedulable {
  if (c.status !== "DRAFT") throw conflict(`Only drafts can be scheduled (this one is ${c.status})`);
  if (c.startsAt <= now) throw invalid("Start time is in the past: pick a future start");
  return { ...c, status: "SCHEDULED", scheduleVersion: c.scheduleVersion + 1 };
}

export function cancel(c: Schedulable): Schedulable {
  if (c.status === "ENDED" || c.status === "CANCELLED") throw conflict(`A ${c.status.toLowerCase()} campaign can't be cancelled`);
  return { ...c, status: "CANCELLED", scheduleVersion: c.scheduleVersion + 1 };
}

export type EditRequest = {
  startsAt: Date;
  endsAt: Date;
  brandsChanged: boolean;
  prizesChanged: boolean;
  minOrderChanged: boolean;
};

/**
 * What may change in each state. Returns the campaign with a bumped
 * scheduleVersion when the schedule moved, so pending tasks go stale.
 */
export function applyEdit(c: Schedulable, edit: EditRequest, now: Date): Schedulable {
  const fail = (msg: string) => {
    throw conflict(msg);
  };
  if (c.status === "ENDED" || c.status === "CANCELLED") fail(`A ${c.status.toLowerCase()} campaign is read-only`);

  const rulesChanged = edit.brandsChanged || edit.prizesChanged || edit.minOrderChanged;
  if (c.status === "LIVE") {
    if (edit.startsAt.getTime() !== c.startsAt.getTime()) fail("A live campaign's start can't move");
    if (rulesChanged) fail("Brands, prizes and the minimum order are locked while a campaign is live");
    if (edit.endsAt <= now) fail("The new end must be in the future");
  }
  if (c.status === "SCHEDULED") {
    const locked = c.startsAt.getTime() - now.getTime() <= CONFIG_LOCK_MS;
    if (locked && rulesChanged) fail("Brands, prizes and the minimum order lock 1 hour before start");
    if (edit.startsAt <= now) fail("Start time is in the past: pick a future start");
  }
  if (edit.endsAt <= edit.startsAt) throw invalid("End must be after start");

  const moved = edit.startsAt.getTime() !== c.startsAt.getTime() || edit.endsAt.getTime() !== c.endsAt.getTime();
  return {
    ...c,
    startsAt: edit.startsAt,
    endsAt: edit.endsAt,
    scheduleVersion: moved ? c.scheduleVersion + 1 : c.scheduleVersion,
  };
}
