import { Body, Controller, ForbiddenException, Get, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { ActorGuard, CurrentActor, sessionSecret } from "./auth/actor";
import { issueToken } from "./auth/token";
import { ZodPipe } from "./common/http";
import type { Actor } from "./domain/access";
import { config, demoLoginEnabled } from "./config";
import { invalid } from "./domain/errors";
import { PrismaService } from "./prisma.service";

const DemoLogin = z.object({ email: z.string().email() });

@Controller()
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  /** The demo users a visitor can sign in as. Only exposed when DEMO_LOGIN=true. */
  @Get("auth/demo-users")
  async demoUsers() {
    if (!demoLoginEnabled()) throw new ForbiddenException();
    const users = await this.prisma.user.findMany({
      orderBy: [{ tenantId: "asc" }, { role: "asc" }],
      select: { email: true, name: true, role: true, timeZone: true, tenant: { select: { name: true } } },
    });
    return users.map((u) => ({ ...u, tenant: u.tenant.name }));
  }

  @Post("auth/demo-login")
  async demoLogin(@Body(new ZodPipe(DemoLogin)) body: z.infer<typeof DemoLogin>) {
    if (!demoLoginEnabled()) throw new ForbiddenException();
    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (!user) throw invalid("No such demo user. Pick one from the list.");
    return { token: issueToken(user.id, sessionSecret()) };
  }

  /** Ops check: which modes are on and whether the database answers. Flags only, never values. */
  @Get("health")
  async health() {
    const started = Date.now();
    let db = "ok";
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = "unreachable";
    }
    return {
      db,
      dbMs: Date.now() - started,
      demoLogin: demoLoginEnabled(),
      sessionSecret: Boolean(config().SESSION_SECRET),
      scheduler: config().scheduler,
      // Without it the daily sweep refuses every call in production; surfaced here rather than crashing boot.
      cronSecret: Boolean(config().CRON_SECRET),
    };
  }

  /** Who am I, and what can I touch: drives the admin's brand pickers and time zone. */
  @Get("me")
  @UseGuards(ActorGuard)
  async me(@CurrentActor() actor: Actor) {
    const [user, brands] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { name: true, email: true, role: true, timeZone: true, tenant: { select: { name: true } } } }),
      this.prisma.brand.findMany({ where: { id: { in: actor.brandIds } }, select: { id: true, name: true, currency: true }, orderBy: { name: "asc" } }),
    ]);
    return { ...user, tenant: user.tenant.name, brands };
  }
}
