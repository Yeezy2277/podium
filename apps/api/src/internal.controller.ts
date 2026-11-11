import { Controller, ForbiddenException, Get, Headers, HttpCode, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { CampaignsService } from "./campaigns/campaigns.service";
import { verifyQStashSignature } from "./scheduler/scheduler";
import { config } from "./config";

const Task = z.object({
  campaignId: z.string(),
  to: z.enum(["LIVE", "ENDED"]),
  at: z.coerce.date(),
  scheduleVersion: z.number().int(),
});

const same = (a: string | undefined, b: string | undefined) =>
  !!a && !!b && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Machine-to-machine endpoints: QStash deliveries and the cron sweep. Never called by the admin UI. */
@Controller("internal")
export class InternalController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Post("transitions")
  @HttpCode(200)
  async transition(@Req() req: Request & { rawBody?: Buffer }, @Headers("upstash-signature") signature?: string) {
    const raw = req.rawBody?.toString("utf8") ?? "";
    const c = config();
    const url = `${c.PUBLIC_API_URL ?? ""}/api/internal/transitions`;
    if (!verifyQStashSignature({ jwt: signature ?? null, body: raw, url, keys: c.signingKeys })) throw new ForbiddenException("Bad signature");
    // A malformed task will never succeed: acknowledge so QStash stops retrying.
    // That includes a body that isn't JSON; throwing would be a 500 retried forever.
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { kind: "dropped", reason: "body is not JSON" };
    }
    const task = Task.safeParse(parsed);
    if (!task.success) return { kind: "dropped", reason: "malformed task" };
    return this.campaigns.runTask(task.data);
  }

  /** Daily safety net (Vercel cron sends `Authorization: Bearer $CRON_SECRET`), and the scheduler in local dev. */
  @Post("sweep")
  @Get("sweep") // Vercel cron uses GET
  @HttpCode(200)
  sweep(@Headers("authorization") auth?: string) {
    const { CRON_SECRET: secret, NODE_ENV } = config();
    const allowed = secret ? same(auth?.replace(/^Bearer\s+/i, ""), secret) : NODE_ENV !== "production";
    if (!allowed) throw new ForbiddenException();
    return this.campaigns.sweep();
  }
}
