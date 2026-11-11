import { describe, expect, it } from "vitest";
import { assertBrandsAllowed, assertCanEditCampaign, canSeeCampaign, type Actor } from "./access";
import { DomainError } from "./errors";
import { applyEdit, cancel, decideTask, nextTransition, schedule, type Schedulable } from "./lifecycle";

const actor = (over: Partial<Actor> = {}): Actor => ({
  userId: "u1",
  tenantId: "t1",
  role: "BRAND_MANAGER",
  brandIds: ["b1"],
  timeZone: "America/Sao_Paulo",
  ...over,
});

const kind = (fn: () => unknown) => {
  try {
    fn();
    return "ok";
  } catch (e) {
    return e instanceof DomainError ? e.kind : "crash";
  }
};

describe("access", () => {
  it("lets a manager see a shared campaign but not edit it", () => {
    expect(canSeeCampaign(actor(), ["b1", "b2"])).toBe(true);
    expect(kind(() => assertCanEditCampaign(actor(), ["b1", "b2"]))).toBe("forbidden");
    expect(kind(() => assertCanEditCampaign(actor(), ["b1"]))).toBe("ok");
  });

  it("keeps viewers read-only and owners unrestricted", () => {
    expect(kind(() => assertCanEditCampaign(actor({ role: "VIEWER" }), ["b1"]))).toBe("forbidden");
    expect(kind(() => assertCanEditCampaign(actor({ role: "OWNER", brandIds: ["b1", "b2"] }), ["b2"]))).toBe("ok");
  });

  it("names the brands that are out of reach", () => {
    try {
      assertBrandsAllowed(actor(), ["b1", "b9"]);
    } catch (e) {
      expect((e as DomainError).details).toEqual({ brandIds: ["b9"] });
    }
  });
});

const T = (iso: string) => new Date(iso);
const base: Schedulable = {
  status: "DRAFT",
  startsAt: T("2026-12-01T12:00:00Z"),
  endsAt: T("2026-12-08T12:00:00Z"),
  scheduleVersion: 0,
};

describe("lifecycle", () => {
  it("refuses to schedule a start in the past", () => {
    expect(kind(() => schedule(base, T("2026-12-01T12:00:01Z")))).toBe("validation");
    expect(schedule(base, T("2026-11-30T00:00:00Z"))).toMatchObject({ status: "SCHEDULED", scheduleVersion: 1 });
  });

  it("plans one transition at a time", () => {
    const s = schedule(base, T("2026-11-30T00:00:00Z"));
    expect(nextTransition(s)).toEqual({ to: "LIVE", at: s.startsAt, scheduleVersion: 1 });
    expect(nextTransition({ ...s, status: "LIVE" })).toMatchObject({ to: "ENDED", at: s.endsAt });
    expect(nextTransition({ ...s, status: "ENDED" })).toBeNull();
  });

  it("ignores a task queued before the campaign was rescheduled", () => {
    const s = schedule(base, T("2026-11-30T00:00:00Z"));
    const task = nextTransition(s)!;
    const moved = applyEdit(s, { startsAt: T("2026-12-02T12:00:00Z"), endsAt: s.endsAt, brandsChanged: false, prizesChanged: false, minOrderChanged: false }, T("2026-11-30T00:00:00Z"));
    expect(decideTask(moved, task, T("2026-12-01T12:00:00Z"))).toMatchObject({ kind: "stale" });
  });

  it("applies a due task, and says when to retry an early one", () => {
    const s = schedule(base, T("2026-11-30T00:00:00Z"));
    const task = nextTransition(s)!;
    expect(decideTask(s, task, T("2026-12-01T12:00:00Z"))).toEqual({ kind: "apply", status: "LIVE" });
    expect(decideTask(s, task, T("2026-12-01T11:59:00Z"))).toEqual({ kind: "early", retryAt: s.startsAt });
  });

  it("delivering the same task twice is harmless", () => {
    const s = schedule(base, T("2026-11-30T00:00:00Z"));
    const task = nextTransition(s)!;
    const live = { ...s, status: "LIVE" as const };
    expect(decideTask(live, task, T("2026-12-01T12:00:05Z"))).toMatchObject({ kind: "stale" });
  });

  it("locks rules an hour before start and while live, but allows extending a live campaign", () => {
    const s = schedule(base, T("2026-11-30T00:00:00Z"));
    const edit = { startsAt: s.startsAt, endsAt: s.endsAt, brandsChanged: false, prizesChanged: true, minOrderChanged: false };
    expect(kind(() => applyEdit(s, edit, T("2026-12-01T11:30:00Z")))).toBe("conflict");
    expect(kind(() => applyEdit(s, edit, T("2026-11-30T12:00:00Z")))).toBe("ok");

    const live = { ...s, status: "LIVE" as const };
    expect(kind(() => applyEdit(live, edit, T("2026-12-03T00:00:00Z")))).toBe("conflict");
    const extended = applyEdit(live, { ...edit, prizesChanged: false, endsAt: T("2026-12-10T12:00:00Z") }, T("2026-12-03T00:00:00Z"));
    expect(extended.scheduleVersion).toBe(s.scheduleVersion + 1);
  });

  it("can't cancel what already finished", () => {
    expect(kind(() => cancel({ ...base, status: "ENDED" }))).toBe("conflict");
    expect(cancel({ ...base, status: "LIVE" })).toMatchObject({ status: "CANCELLED", scheduleVersion: 1 });
  });
});
