import {
  createParamDecorator,
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import type { Actor } from "../domain/access";
import { PrismaService } from "../prisma.service";
import { verifyToken } from "./token";

type WithActor = Request & { actor?: Actor };

export const sessionSecret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is required in production");
  return s ?? "dev-only-session-secret";
};

/**
 * Resolves the caller into an Actor once per request: tenant, role, and the
 * concrete brand ids they may touch. Controllers never see raw user ids.
 */
@Injectable()
export class ActorGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<WithActor>();
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    const userId = verifyToken(token, sessionSecret());
    if (!userId) throw new UnauthorizedException("Sign in again");

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { brands: { select: { brandId: true } } },
    });
    if (!user) throw new UnauthorizedException("Sign in again");

    const brandIds =
      user.role === "OWNER"
        ? (await this.prisma.brand.findMany({ where: { tenantId: user.tenantId }, select: { id: true } })).map((b) => b.id)
        : user.brands.map((b) => b.brandId);

    req.actor = { userId: user.id, tenantId: user.tenantId, role: user.role, brandIds, timeZone: user.timeZone };
    return true;
  }
}

export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  const actor = ctx.switchToHttp().getRequest<WithActor>().actor;
  if (!actor) throw new UnauthorizedException();
  return actor;
});
