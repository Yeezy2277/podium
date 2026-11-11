import { Controller, ForbiddenException, Get, Headers, HttpCode, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { CampaignsService } from "./campaigns/campaigns.service";
import { verifyQStashSignature } from "./scheduler/scheduler";

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
    const url = `${process.env.PUBLIC_API_URL ?? ""}/api/internal/transitions`;
    const keys = [process.env.QSTASH_CURRENT_SIGNING_KEY ?? "", process.env.QSTASH_NEXT_SIGNING_KEY ?? ""];
    if (!verifyQStashSignature({ jwt: signature ?? null, body: raw, url, keys })) throw new ForbiddenException("Bad signature");
    const task = Task.safeParse(JSON.parse(raw));
    // A malformed task will never succeed: acknowledge so QStash stops retrying.
    if (!task.success) return { kind: "dropped" };
    return this.campaigns.runTask(task.data);
  }

  /** Daily safety net (Vercel cron sends `Authorization: Bearer $CRON_SECRET`), and the scheduler in local dev. */
  @Post("sweep")
  @Get("sweep") // Vercel cron uses GET
  @HttpCode(200)
  sweep(@Headers("authorization") auth?: string) {
    const secret = process.env.CRON_SECRET;
    const allowed = secret ? same(auth?.replace(/^Bearer\s+/i, ""), secret) : process.env.NODE_ENV !== "production";
    if (!allowed) throw new ForbiddenException();
    return this.campaigns.sweep();
  }
}
