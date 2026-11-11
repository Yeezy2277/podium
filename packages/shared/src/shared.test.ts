import { describe, expect, it } from "vitest";
import { CampaignInput } from "./campaign";
import { formatMoney, parseMoney } from "./money";
import { localToUtc, utcToLocal, zoneOffsetMinutes } from "./time";

describe("time zones", () => {
  it("converts São Paulo wall clock to UTC (UTC-3, no DST)", () => {
    expect(localToUtc("2026-12-01T09:00", "America/Sao_Paulo").toISOString()).toBe("2026-12-01T12:00:00.000Z");
  });

  it("handles New York across DST: EDT in July, EST in December", () => {
    expect(localToUtc("2026-07-01T09:00", "America/New_York").toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(localToUtc("2026-12-01T09:00", "America/New_York").toISOString()).toBe("2026-12-01T14:00:00.000Z");
  });

  it("round-trips: what the admin typed is what the admin sees", () => {
    for (const zone of ["America/Sao_Paulo", "America/New_York", "Asia/Kolkata", "Europe/Sofia"]) {
      expect(utcToLocal(localToUtc("2026-03-29T23:30", zone), zone)).toBe("2026-03-29T23:30");
    }
  });

  it("shows the same instant differently to admins in different zones", () => {
    const at = localToUtc("2026-12-01T00:30", "America/Sao_Paulo");
    expect(utcToLocal(at, "America/New_York")).toBe("2026-11-30T22:30"); // previous day in NY
    expect(zoneOffsetMinutes("Asia/Kolkata", at)).toBe(330);
  });
});

describe("money", () => {
  it("parses decimal strings without float error", () => {
    expect(parseMoney("19.99", "USD")).toBe(1999);
    expect(parseMoney("0.1", "USD") + parseMoney("0.2", "USD")).toBe(30);
    expect(parseMoney("500", "JPY")).toBe(500);
  });

  it("rejects more decimals than the currency has", () => {
    expect(() => parseMoney("1.005", "USD")).toThrow();
    expect(() => parseMoney("1.5", "JPY")).toThrow();
  });

  it("formats minor units in the currency's own precision", () => {
    expect(formatMoney(1999, "USD")).toBe("$19.99");
    expect(formatMoney(500, "JPY")).toBe("¥500");
  });
});

describe("CampaignInput", () => {
  const valid = {
    name: "Black Friday Top Spenders",
    brandIds: ["b1"],
    metric: "TOTAL_SPEND",
    startsAtLocal: "2026-11-27T00:00",
    endsAtLocal: "2026-11-30T23:59",
    timeZone: "America/Sao_Paulo",
    prizes: [
      { place: 1, type: "COUPON", amountMinor: 10000 },
      { place: 2, type: "COUPON", amountMinor: 5000 },
    ],
  };

  it("accepts a well-formed campaign", () => {
    expect(CampaignInput.safeParse(valid).success).toBe(true);
  });

  it("rejects gaps or repeats in prize places", () => {
    const r = CampaignInput.safeParse({ ...valid, prizes: [{ place: 1, type: "GIFT", amountMinor: 1 }, { place: 3, type: "GIFT", amountMinor: 1 }] });
    expect(r.success).toBe(false);
  });

  it("rejects an end before the start and an unknown zone", () => {
    expect(CampaignInput.safeParse({ ...valid, endsAtLocal: "2026-11-26T00:00" }).success).toBe(false);
    expect(CampaignInput.safeParse({ ...valid, timeZone: "Mars/Olympus" }).success).toBe(false);
  });
});
