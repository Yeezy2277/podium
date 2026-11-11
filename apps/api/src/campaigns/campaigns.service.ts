import { Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { localToUtc, type CampaignInput, type CampaignRow, type LeaderboardRow, type Page, type PageQuery } from "@podium/shared";
import { assertBrandsAllowed, assertCanEdit, assertCanEditCampaign, type Actor } from "../domain/access";
import { conflict, forbidden, invalid, notFound } from "../domain/errors";
import { applyEdit, cancel, decideTask, nextTransition, schedule, type Schedulable } from "../domain/lifecycle";
import { PrismaService } from "../prisma.service";
import { SCHEDULER, type Scheduler, type TransitionTask } from "../scheduler/scheduler";

const SORTABLE = { name: "name", startsAt: "startsAt", endsAt: "endsAt", status: "status", createdAt: "createdAt" } as const;

const withRelations = {
  brands: { select: { brand: { select: { id: true, name: true } } } },
  prizes: { orderBy: { place: "asc" as const } },
} satisfies Prisma.CampaignInclude;
type CampaignWithRelations = Prisma.CampaignGetPayload<{ include: typeof withRelations }>;

@Injectable()
export class CampaignsService {
  private readonly log = new Logger(CampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SCHEDULER) private readonly scheduler: Scheduler,
  ) {}

  /** Tenant scoping plus brand visibility, as a Prisma filter every read starts from. */
  private visibleTo(actor: Actor): Prisma.CampaignWhereInput {
    return actor.role === "OWNER"
      ? { tenantId: actor.tenantId }
      : { tenantId: actor.tenantId, brands: { some: { brandId: { in: actor.brandIds } } } };
  }

  async list(actor: Actor, q: PageQuery): Promise<Page<CampaignRow>> {
    if (q.brandId && !actor.brandIds.includes(q.brandId)) throw forbidden("You don't have access to that brand");
    const where: Prisma.CampaignWhereInput = {
      AND: [
        this.visibleTo(actor),
        q.status ? { status: q.status } : {},
        q.brandId ? { brands: { some: { brandId: q.brandId } } } : {},
        q.q ? { name: { contains: q.q, mode: "insensitive" } } : {},
      ],
    };
    const sortField = SORTABLE[(q.sort ?? "startsAt") as keyof typeof SORTABLE] ?? "startsAt";
    // One round trip for the page (relations batched by Prisma, no N+1) and one for the count.
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.campaign.findMany({
        where,
        include: withRelations,
        orderBy: [{ [sortField]: q.dir }, { id: "asc" }],
        skip: q.page * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.campaign.count({ where }),
    ]);
    return { rows: rows.map(toRow), total, page: q.page, pageSize: q.pageSize };
  }

  async get(actor: Actor, id: string) {
    const c = await this.prisma.campaign.findFirst({ where: { AND: [{ id }, this.visibleTo(actor)] }, include: withRelations });
    // Same 404 for "doesn't exist" and "not yours": don't confirm other tenants' ids.
    if (!c) throw notFound("Campaign not found");
    return { ...toRow(c), minOrderMinor: c.minOrderMinor, prizes: c.prizes, scheduleVersion: c.scheduleVersion };
  }

  /** All brands share one currency, or prize amounts would be meaningless. */
  private async currencyFor(actor: Actor, brandIds: string[]): Promise<string> {
    const brands = await this.prisma.brand.findMany({ where: { id: { in: brandIds }, tenantId: actor.tenantId }, select: { id: true, currency: true } });
    if (brands.length !== brandIds.length) throw forbidden("You don't have access to some of these brands");
    const currencies = new Set(brands.map((b) => b.currency));
    if (currencies.size > 1) throw invalid(`These brands sell in different currencies (${[...currencies].join(", ")})`);
    return [...currencies][0]!;
  }

  async create(actor: Actor, input: CampaignInput) {
    assertCanEdit(actor);
    assertBrandsAllowed(actor, input.brandIds);
    const currency = await this.currencyFor(actor, input.brandIds);
    const created = await this.prisma.campaign.create({
      data: {
        tenantId: actor.tenantId,
        createdById: actor.userId,
        name: input.name,
        metric: input.metric,
        startsAt: localToUtc(input.startsAtLocal, input.timeZone),
        endsAt: localToUtc(input.endsAtLocal, input.timeZone),
        minOrderMinor: input.minOrderMinor,
        currency,
        brands: { create: input.brandIds.map((brandId) => ({ brandId })) },
        prizes: { create: input.prizes },
      },
    });
    return this.get(actor, created.id);
  }

  async update(actor: Actor, id: string, input: CampaignInput, expectedVersion: number) {
    const current = await this.get(actor, id);
    assertCanEditCampaign(actor, current.brands.map((b) => b.id));
    assertBrandsAllowed(actor, input.brandIds);
    const currency = await this.currencyFor(actor, input.brandIds);

    const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
    const prizeKey = (p: { place: number; type: string; amountMinor: number }) => `${p.place}:${p.type}:${p.amountMinor}`;
    const next = applyEdit(
      schedulable(current),
      {
        startsAt: localToUtc(input.startsAtLocal, input.timeZone),
        endsAt: localToUtc(input.endsAtLocal, input.timeZone),
        brandsChanged: !sameSet(current.brands.map((b) => b.id), input.brandIds),
        prizesChanged: !sameSet(current.prizes.map(prizeKey), input.prizes.map(prizeKey)),
        minOrderChanged: current.minOrderMinor !== input.minOrderMinor,
      },
      new Date(),
    );

    await this.prisma.$transaction(async (tx) => {
      // Optimistic lock: the update only lands if nobody saved in between.
      const { count } = await tx.campaign.updateMany({
        where: { id, version: expectedVersion },
        data: {
          name: input.name,
          metric: input.metric,
          startsAt: next.startsAt,
          endsAt: next.endsAt,
          minOrderMinor: input.minOrderMinor,
          currency,
          scheduleVersion: next.scheduleVersion,
          version: { increment: 1 },
        },
      });
      if (count === 0) throw conflict("Someone else saved this campaign while you were editing. Reload to see their changes.");
      await tx.campaignBrand.deleteMany({ where: { campaignId: id } });
      await tx.campaignBrand.createMany({ data: input.brandIds.map((brandId) => ({ campaignId: id, brandId })) });
      await tx.prize.deleteMany({ where: { campaignId: id } });
      await tx.prize.createMany({ data: input.prizes.map((p) => ({ ...p, campaignId: id })) });
    });

    if (next.scheduleVersion !== current.scheduleVersion) await this.planNext(id, next);
    return this.get(actor, id);
  }

  async schedule(actor: Actor, id: string, expectedVersion: number) {
    const current = await this.get(actor, id);
    assertCanEditCampaign(actor, current.brands.map((b) => b.id));
    const next = schedule(schedulable(current), new Date());
    await this.saveStatus(id, expectedVersion, next);
    await this.planNext(id, next);
    return this.get(actor, id);
  }

  async cancel(actor: Actor, id: string, expectedVersion: number) {
    const current = await this.get(actor, id);
    assertCanEditCampaign(actor, current.brands.map((b) => b.id));
    await this.saveStatus(id, expectedVersion, cancel(schedulable(current)));
    return this.get(actor, id);
  }

  private async saveStatus(id: string, expectedVersion: number, next: Schedulable) {
    const { count } = await this.prisma.campaign.updateMany({
      where: { id, version: expectedVersion },
      data: { status: next.status, scheduleVersion: next.scheduleVersion, version: { increment: 1 } },
    });
    if (count === 0) throw conflict("Someone else saved this campaign while you were editing. Reload to see their changes.");
  }

  private async planNext(campaignId: string, c: Schedulable) {
    const t = nextTransition(c);
    if (t) await this.scheduler.schedule({ ...t, campaignId });
  }

  /**
   * A scheduled transition fired. Delivery is at-least-once and possibly late
   * or obsolete; decideTask makes every case safe, and the conditional update
   * makes two concurrent deliveries apply at most once.
   */
  async runTask(task: TransitionTask, now = new Date()) {
    const c = await this.prisma.campaign.findUnique({ where: { id: task.campaignId } });
    if (!c) return { kind: "stale" as const, reason: "campaign deleted" };
    const decision = decideTask(c, task, now);
    if (decision.kind === "early") {
      // Delivered before its time (clock skew): queue again just after the real time.
      // The +30s also gives the retry a different dedup id from the original message.
      await this.scheduler.schedule({ ...task, at: new Date(decision.retryAt.getTime() + 30_000) });
      return decision;
    }
    if (decision.kind === "stale") return decision;

    const { count } = await this.prisma.campaign.updateMany({
      where: { id: c.id, status: c.status, scheduleVersion: c.scheduleVersion },
      data: { status: decision.status, version: { increment: 1 } },
    });
    if (count === 1) {
      this.log.log(`campaign ${c.id}: ${c.status} → ${decision.status}`);
      await this.planNext(c.id, { ...c, status: decision.status });
    }
    return decision;
  }

  /** Safety net (daily cron, and the only driver in local dev): apply every overdue transition. */
  async sweep(now = new Date()) {
    const due = await this.prisma.campaign.findMany({
      where: { OR: [{ status: "SCHEDULED", startsAt: { lte: now } }, { status: "LIVE", endsAt: { lte: now } }] },
      select: { id: true, status: true, startsAt: true, endsAt: true, scheduleVersion: true },
    });
    const results = [];
    for (const c of due) {
      // A campaign whose whole window passed unnoticed goes SCHEDULED → LIVE → ENDED in one sweep.
      let t = nextTransition(c);
      while (t && t.at <= now) {
        const r = await this.runTask({ ...t, campaignId: c.id }, now);
        results.push({ id: c.id, ...r });
        if (r.kind !== "apply") break;
        const fresh = await this.prisma.campaign.findUniqueOrThrow({ where: { id: c.id } });
        t = nextTransition(fresh);
      }
    }
    return { checked: due.length, results };
  }

  async leaderboard(actor: Actor, id: string, page: number, pageSize: number): Promise<Page<LeaderboardRow>> {
    const c = await this.get(actor, id);
    const startsAt = new Date(c.startsAt);
    const endsAt = new Date(c.endsAt);
    const score = c.metric === "ORDER_COUNT" ? Prisma.sql`COUNT(*)` : Prisma.sql`SUM(o."amountMinor")`;

    // One aggregate query with a window function: ranking happens in Postgres,
    // not by loading every order into memory. RANK() gives ties the same place.
    const rows = await this.prisma.$queryRaw<{ customerId: string; displayName: string; score: bigint; orders: bigint; rank: bigint }[]>`
      SELECT o."customerId", cu."displayName",
             ${score} AS score, COUNT(*) AS orders,
             RANK() OVER (ORDER BY ${score} DESC) AS rank
      FROM "Order" o
      JOIN "CampaignBrand" cb ON cb."brandId" = o."brandId" AND cb."campaignId" = ${id}
      JOIN "Customer" cu ON cu.id = o."customerId"
      WHERE o."placedAt" >= ${startsAt} AND o."placedAt" < ${endsAt} AND o."amountMinor" >= ${c.minOrderMinor}
      GROUP BY o."customerId", cu."displayName"
      ORDER BY score DESC, o."customerId"
      LIMIT ${pageSize} OFFSET ${page * pageSize}`;

    const [{ total }] = await this.prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(DISTINCT o."customerId") AS total
      FROM "Order" o
      JOIN "CampaignBrand" cb ON cb."brandId" = o."brandId" AND cb."campaignId" = ${id}
      WHERE o."placedAt" >= ${startsAt} AND o."placedAt" < ${endsAt} AND o."amountMinor" >= ${c.minOrderMinor}` as [{ total: bigint }];

    const prizeByPlace = new Map(c.prizes.map((p) => [p.place, p]));
    return {
      rows: rows.map((r) => {
        const prize = prizeByPlace.get(Number(r.rank));
        return {
          rank: Number(r.rank),
          customerId: r.customerId,
          displayName: r.displayName,
          score: Number(r.score),
          orders: Number(r.orders),
          ...(prize ? { prize: { type: prize.type, amountMinor: prize.amountMinor } } : {}),
        };
      }),
      total: Number(total),
      page,
      pageSize,
    };
  }
}

function toRow(c: CampaignWithRelations): CampaignRow {
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    metric: c.metric,
    startsAt: c.startsAt.toISOString(),
    endsAt: c.endsAt.toISOString(),
    currency: c.currency,
    brands: c.brands.map((b) => b.brand),
    prizePool: c.prizes.reduce((sum, p) => sum + p.amountMinor, 0),
    places: c.prizes.length,
    version: c.version,
  };
}

const schedulable = (c: { status: CampaignRow["status"]; startsAt: string; endsAt: string; scheduleVersion: number }): Schedulable => ({
  status: c.status,
  startsAt: new Date(c.startsAt),
  endsAt: new Date(c.endsAt),
  scheduleVersion: c.scheduleVersion,
});
