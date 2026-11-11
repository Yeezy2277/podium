import type { Role } from "@podium/shared";
import { forbidden } from "./errors";

/**
 * Who is acting, already resolved: for an OWNER `brandIds` holds every brand
 * of the tenant, for everyone else only the brands they were assigned. Every
 * query and mutation goes through this, never through raw ids from the client.
 */
export type Actor = {
  userId: string;
  tenantId: string;
  role: Role;
  brandIds: string[];
  timeZone: string;
};

export function assertCanEdit(actor: Actor): void {
  if (actor.role === "VIEWER") throw forbidden("Viewers can't change campaigns");
}

/** Every brand on the campaign must be one the actor manages. */
export function assertBrandsAllowed(actor: Actor, brandIds: string[]): void {
  const allowed = new Set(actor.brandIds);
  const outside = brandIds.filter((id) => !allowed.has(id));
  if (outside.length) throw forbidden("You don't have access to some of these brands", { brandIds: outside });
}

/**
 * A brand manager *sees* a campaign if it touches any of their brands, but may
 * *change* it only if it touches nothing else: otherwise one store's manager
 * could edit a promotion running in a store they don't run.
 */
export const canSeeCampaign = (actor: Actor, campaignBrandIds: string[]) =>
  actor.role === "OWNER" || campaignBrandIds.some((id) => actor.brandIds.includes(id));

export function assertCanEditCampaign(actor: Actor, campaignBrandIds: string[]): void {
  assertCanEdit(actor);
  if (actor.role !== "OWNER") assertBrandsAllowed(actor, campaignBrandIds);
}
