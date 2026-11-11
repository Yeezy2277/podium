/**
 * Wall-clock ⇄ UTC conversion for an IANA zone, using only Intl.
 *
 * Admins type "2026-12-01 09:00" meaning 9am *their* time. We store the UTC
 * instant and render it back in whichever zone the viewer works in. Converting
 * exactly once at each edge is the whole trick; reports that disagree near
 * midnight are almost always a double conversion.
 */

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Offset of `zone` from UTC at a given instant, in minutes (e.g. São Paulo → -180). */
export function zoneOffsetMinutes(zone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/**
 * "2026-12-01T09:00" in `zone` → UTC Date. Resolves DST gaps forward and
 * ambiguous fall-back times to the first occurrence, like most calendar UIs.
 */
export function localToUtc(local: string, zone: string): Date {
  const m = LOCAL_RE.exec(local);
  if (!m) throw new Error(`Expected YYYY-MM-DDTHH:mm, got "${local}"`);
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes: the offset can differ between the naive guess and the result (DST).
  let guess = naive - zoneOffsetMinutes(zone, new Date(naive)) * 60_000;
  guess = naive - zoneOffsetMinutes(zone, new Date(guess)) * 60_000;
  return new Date(guess);
}

/** UTC instant → "YYYY-MM-DDTHH:mm" wall clock in `zone` (the value a datetime-local input wants). */
export function utcToLocal(at: Date, zone: string): string {
  const shifted = new Date(at.getTime() + zoneOffsetMinutes(zone, at) * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
