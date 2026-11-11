import type { CampaignInput, CampaignRow, LeaderboardRow, Page } from "@podium/shared";

const TOKEN_KEY = "podium.token";

export const session = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string | null) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private mode: session lasts for the tab only */
    }
  },
};

type FieldError = { path: string; message: string };

/** The API's one error envelope: `{ error, message, details?, requestId }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields: FieldError[] = [],
    readonly code = "http_error",
    readonly requestId?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = session.get();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 401) {
    session.set(null);
    window.location.assign("/login");
  }
  const body = res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) {
    const b = (body ?? {}) as { error?: string; message?: string; details?: unknown; requestId?: string };
    // Validation errors carry per-field details; other errors may carry anything, so only take a list of fields.
    const fields = Array.isArray(b.details) ? (b.details as FieldError[]).filter((f) => typeof f?.path === "string") : [];
    throw new ApiError(res.status, b.message || res.statusText || "Request failed", fields, b.error, b.requestId);
  }
  return body as T;
}

export type Me = {
  name: string;
  email: string;
  role: "OWNER" | "BRAND_MANAGER" | "VIEWER";
  timeZone: string;
  tenant: string;
  brands: { id: string; name: string; currency: string }[];
};

export type CampaignDetail = CampaignRow & {
  minOrderMinor: number;
  scheduleVersion: number;
  prizes: { place: number; type: "COUPON" | "CASHBACK" | "GIFT"; amountMinor: number; description: string | null }[];
};

export type DemoUser = { email: string; name: string; role: Me["role"]; timeZone: string; tenant: string };

const qs = (params: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== "") as [string, string][]).toString();

export const api = {
  demoUsers: () => request<DemoUser[]>("/auth/demo-users"),
  demoLogin: (email: string) => request<{ token: string }>("/auth/demo-login", { method: "POST", body: JSON.stringify({ email }) }),
  me: () => request<Me>("/me"),
  campaigns: (p: { page: number; pageSize: number; sort?: string; dir?: "asc" | "desc"; status?: string; q?: string }) =>
    request<Page<CampaignRow>>(`/campaigns?${qs(p)}`),
  campaign: (id: string) => request<CampaignDetail>(`/campaigns/${id}`),
  create: (input: CampaignInput) => request<CampaignDetail>("/campaigns", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, campaign: CampaignInput, version: number) =>
    request<CampaignDetail>(`/campaigns/${id}`, { method: "PUT", body: JSON.stringify({ campaign, version }) }),
  schedule: (id: string, version: number) => request<CampaignDetail>(`/campaigns/${id}/schedule`, { method: "PATCH", body: JSON.stringify({ version }) }),
  cancel: (id: string, version: number) => request<CampaignDetail>(`/campaigns/${id}/cancel`, { method: "PATCH", body: JSON.stringify({ version }) }),
  leaderboard: (id: string, page: number, pageSize: number) => request<Page<LeaderboardRow>>(`/campaigns/${id}/leaderboard?${qs({ page, pageSize })}`),
};
