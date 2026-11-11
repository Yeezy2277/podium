import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { CampaignInput, PageQuery } from "@podium/shared";
import { z } from "zod";
import { ActorGuard, CurrentActor } from "../auth/actor";
import { ZodPipe } from "../common/http";
import type { Actor } from "../domain/access";
import { CampaignsService } from "./campaigns.service";

const Versioned = z.object({ version: z.number().int().positive() });
const UpdateBody = z.object({ campaign: CampaignInput, version: z.number().int().positive() });
const LeaderboardQuery = z.object({
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

@Controller("campaigns")
@UseGuards(ActorGuard)
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  list(@CurrentActor() actor: Actor, @Query(new ZodPipe(PageQuery)) q: PageQuery) {
    return this.campaigns.list(actor, q);
  }

  @Get(":id")
  get(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.campaigns.get(actor, id);
  }

  @Post()
  create(@CurrentActor() actor: Actor, @Body(new ZodPipe(CampaignInput)) input: CampaignInput) {
    return this.campaigns.create(actor, input);
  }

  /** Full replace with optimistic locking: the client sends the version it loaded. */
  @Put(":id")
  update(@CurrentActor() actor: Actor, @Param("id") id: string, @Body(new ZodPipe(UpdateBody)) body: z.infer<typeof UpdateBody>) {
    return this.campaigns.update(actor, id, body.campaign, body.version);
  }

  @Patch(":id/schedule")
  @HttpCode(200)
  schedule(@CurrentActor() actor: Actor, @Param("id") id: string, @Body(new ZodPipe(Versioned)) body: z.infer<typeof Versioned>) {
    return this.campaigns.schedule(actor, id, body.version);
  }

  @Patch(":id/cancel")
  @HttpCode(200)
  cancel(@CurrentActor() actor: Actor, @Param("id") id: string, @Body(new ZodPipe(Versioned)) body: z.infer<typeof Versioned>) {
    return this.campaigns.cancel(actor, id, body.version);
  }

  @Get(":id/leaderboard")
  leaderboard(@CurrentActor() actor: Actor, @Param("id") id: string, @Query(new ZodPipe(LeaderboardQuery)) q: z.infer<typeof LeaderboardQuery>) {
    return this.campaigns.leaderboard(actor, id, q.page, q.pageSize);
  }
}
