import { z } from "zod";
import { isValidTimeZone } from "./time";

export const CAMPAIGN_STATUSES = ["DRAFT", "SCHEDULED", "LIVE", "ENDED", "CANCELLED"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
export const METRICS = ["TOTAL_SPEND", "ORDER_COUNT"] as const;
export const PRIZE_TYPES = ["COUPON", "CASHBACK", "GIFT"] as const;
export const ROLES = ["OWNER", "BRAND_MANAGER", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use YYYY-MM-DDTHH:mm");

export const PrizeInput = z.object({
  place: z.number().int().min(1).max(1000),
  type: z.enum(PRIZE_TYPES),
  amountMinor: z.number().int().positive("A prize needs a positive amount"),
  description: z.string().trim().max(200).optional(),
});
export type PrizeInput = z.infer<typeof PrizeInput>;

/**
 * What the admin form submits. Times are wall-clock in `timeZone` (the admin's
 * zone); the API converts them to UTC exactly once.
 */
export const CampaignInput = z
  .object({
    name: z.string().trim().min(3, "Name is too short").max(120),
    brandIds: z.array(z.string().min(1)).min(1, "Pick at least one brand"),
    metric: z.enum(METRICS),
    startsAtLocal: localDateTime,
    endsAtLocal: localDateTime,
    timeZone: z.string().refine(isValidTimeZone, "Unknown time zone"),
    minOrderMinor: z.number().int().min(0).default(0),
    prizes: z.array(PrizeInput).min(1, "Add at least one prize").max(100),
  })
  .superRefine((v, ctx) => {
    // Lexicographic compare works for the fixed YYYY-MM-DDTHH:mm format in one zone.
    if (v.endsAtLocal <= v.startsAtLocal) {
      ctx.addIssue({ code: "custom", path: ["endsAtLocal"], message: "End must be after start" });
    }
    const places = v.prizes.map((p) => p.place).sort((a, b) => a - b);
    // Places must be 1..N with no gaps or duplicates: "2nd place" without a 1st is a data bug.
    if (places.some((p, i) => p !== i + 1)) {
      ctx.addIssue({ code: "custom", path: ["prizes"], message: "Prize places must run 1, 2, 3… without gaps or repeats" });
    }
    if (new Set(v.brandIds).size !== v.brandIds.length) {
      ctx.addIssue({ code: "custom", path: ["brandIds"], message: "A brand is listed twice" });
    }
  });
export type CampaignInput = z.infer<typeof CampaignInput>;

/** Server-side paging/sorting contract shared by list endpoints and the DataGrid. */
export const PageQuery = z.object({
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.string().optional(),
  dir: z.enum(["asc", "desc"]).default("desc"),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  brandId: z.string().optional(),
  q: z.string().trim().max(100).optional(),
});
export type PageQuery = z.infer<typeof PageQuery>;

export type Page<T> = { rows: T[]; total: number; page: number; pageSize: number };

export type CampaignRow = {
  id: string;
  name: string;
  status: CampaignStatus;
  metric: (typeof METRICS)[number];
  startsAt: string;
  endsAt: string;
  currency: string;
  brands: { id: string; name: string }[];
  prizePool: number;
  places: number;
  version: number;
};

export type LeaderboardRow = {
  rank: number;
  customerId: string;
  displayName: string;
  score: number;
  orders: number;
  prize?: { type: (typeof PRIZE_TYPES)[number]; amountMinor: number };
};
