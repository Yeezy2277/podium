import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Transition } from "../domain/lifecycle";

export type TransitionTask = Transition & { campaignId: string };

/** Fires a transition at (or after) its time, at least once. */
export interface Scheduler {
  schedule(task: TransitionTask): Promise<void>;
}

export const SCHEDULER = Symbol("SCHEDULER");

/**
 * Local/dev: nothing to deliver delayed messages, so transitions are applied by
 * the sweep endpoint instead. Production also runs the sweep daily as a safety net.
 */
export class SweepOnlyScheduler implements Scheduler {
  async schedule() {}
}

/**
 * Upstash QStash delayed delivery: the message is held until `Upstash-Not-Before`
 * and then POSTed to the transitions endpoint, retried until it gets a 2xx.
 */
export class QStashScheduler implements Scheduler {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly targetUrl: string,
  ) {}

  async schedule(task: TransitionTask) {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/v2/publish/${this.targetUrl}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "Upstash-Not-Before": String(Math.floor(task.at.getTime() / 1000)),
        // One message per (campaign, transition, schedule version, time). The time is part of
        // the id so re-queuing an early delivery isn't swallowed as a duplicate.
        // QStash allows only [A-Za-z0-9_-] here.
        "Upstash-Deduplication-Id": `${task.campaignId}_${task.to}_v${task.scheduleVersion}_${Math.floor(task.at.getTime() / 1000)}`.replace(/[^A-Za-z0-9_-]/g, "_"),
        "Upstash-Retries": "5",
      },
      body: JSON.stringify({ ...task, at: task.at.toISOString() }),
    });
    if (!res.ok) throw new Error(`QStash schedule failed: ${res.status} ${await res.text()}`);
  }
}

const b64url = (buf: Buffer) => buf.toString("base64url");

/** Same verification as in Wire: signature (current or next key), issuer, URL, time window, body hash. */
export function verifyQStashSignature(opts: { jwt: string | null; body: string; url: string; keys: string[]; now?: number }): boolean {
  const { jwt, body, url, keys } = opts;
  const parts = jwt?.split(".");
  if (!parts || parts.length !== 3) return false;
  const [header, payload, signature] = parts as [string, string, string];
  const ok = keys.filter(Boolean).some((key) => {
    const expected = Buffer.from(b64url(createHmac("sha256", key).update(`${header}.${payload}`).digest()));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
  if (!ok) return false;
  try {
    const c = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { iss?: string; sub?: string; exp?: number; nbf?: number; body?: string };
    const now = Math.floor((opts.now ?? Date.now()) / 1000);
    return (
      c.iss === "Upstash" &&
      c.sub === url &&
      (c.exp === undefined || now <= c.exp) &&
      (c.nbf === undefined || now >= c.nbf) &&
      c.body?.replace(/=+$/, "") === b64url(createHash("sha256").update(body).digest())
    );
  } catch {
    return false;
  }
}
