import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { ActorGuard, CurrentActor, sessionSecret } from "./auth/actor";
import { issueToken } from "./auth/token";
import { ZodPipe } from "./common/http";
import type { Actor } from "./domain/access";
import { PrismaService } from "./prisma.service";

const DemoLogin = z.object({ email: z.string().email() });

@Controller()
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  /** The demo users a visitor can sign in as. Only exposed when DEMO_LOGIN=true. */
  @Get("auth/demo-users")
  async demoUsers() {
    if (process.env.DEMO_LOGIN !== "true") throw new ForbiddenException();
    const users = await this.prisma.user.findMany({
      orderBy: [{ tenantId: "asc" }, { role: "asc" }],
      select: { email: true, name: true, role: true, timeZone: true, tenant: { select: { name: true } } },
    });
    return users.map((u) => ({ ...u, tenant: u.tenant.name }));
  }

  @Post("auth/demo-login")
  async demoLogin(@Body(new ZodPipe(DemoLogin)) body: z.infer<typeof DemoLogin>) {
    if (process.env.DEMO_LOGIN !== "true") throw new ForbiddenException();
    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (!user) throw new BadRequestException("No such demo user");
    return { token: issueToken(user.id, sessionSecret()) };
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
