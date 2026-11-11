import { formatMoney, utcToLocal, type CampaignStatus } from "@podium/shared";

/** An instant, shown on the admin's own clock (not the browser's). */
export function formatInZone(iso: string, zone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export const toLocalInput = (iso: string, zone: string) => utcToLocal(new Date(iso), zone);

export const money = formatMoney;

export const STATUS_COLOR: Record<CampaignStatus, "default" | "info" | "success" | "warning" | "error"> = {
  DRAFT: "default",
  SCHEDULED: "info",
  LIVE: "success",
  ENDED: "warning",
  CANCELLED: "error",
};
