import { z } from "zod";

/**
 * Env flags, read tolerantly: dashboards make it easy to save `"true"` with
 * quotes or a trailing space, and a flag that silently reads as off is a
 * confusing way to lose an afternoon.
 */
export function flag(name: string, source: Record<string, string | undefined> = process.env): boolean {
  const v = source[name]?.trim().replace(/^["']|["']$/g, "").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export const demoLoginEnabled = () => flag("DEMO_LOGIN");

const str = z.preprocess((v) => (typeof v === "string" ? v.trim() || undefined : v), z.string().optional());
const url = z.preprocess((v) => (typeof v === "string" ? v.trim().replace(/\/$/, "") || undefined : v), z.string().url().optional());

const Schema = z
  .object({
    NODE_ENV: str,
    DATABASE_URL: str,
    SESSION_SECRET: str,
    ADMIN_ORIGIN: str,
    PUBLIC_API_URL: url,
    QSTASH_URL: url,
    QSTASH_TOKEN: str,
    QSTASH_CURRENT_SIGNING_KEY: str,
    QSTASH_NEXT_SIGNING_KEY: str,
    CRON_SECRET: str,
  })
  .superRefine((e, ctx) => {
    const need = (key: keyof typeof e, why: string) => ctx.addIssue({ code: "custom", path: [key], message: why });
    if (!e.DATABASE_URL) need("DATABASE_URL", "required: the API has nothing to serve without Postgres");
    const production = e.NODE_ENV === "production";
    if (production && !e.SESSION_SECRET) need("SESSION_SECRET", "required in production, or sessions are signed with a public dev key");
    if (e.QSTASH_TOKEN && !e.QSTASH_CURRENT_SIGNING_KEY) need("QSTASH_CURRENT_SIGNING_KEY", "required with QSTASH_TOKEN, or deliveries can't be verified");
    if (e.QSTASH_TOKEN && !e.PUBLIC_API_URL) need("PUBLIC_API_URL", "required with QSTASH_TOKEN: it's where QStash delivers transitions");
  });

export type Config = z.infer<typeof Schema> & {
  scheduler: "qstash" | "sweep-only";
  signingKeys: string[];
};

/** Parses the environment; a misconfiguration lists every problem and never a value. */
export function parseConfig(source: Record<string, string | undefined> = process.env): Config {
  const r = Schema.safeParse(source);
  if (!r.success) {
    const problems = r.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Podium API is misconfigured:\n${problems}\nSee .env.example.`);
  }
  const e = r.data;
  return {
    ...e,
    scheduler: e.QSTASH_TOKEN && e.PUBLIC_API_URL ? "qstash" : "sweep-only",
    signingKeys: [e.QSTASH_CURRENT_SIGNING_KEY, e.QSTASH_NEXT_SIGNING_KEY].filter((k): k is string => !!k),
  };
}

let cached: Config | undefined;
/** Validated once at boot (main.ts / serverless.ts call it before Nest starts). */
export const config = (): Config => (cached ??= parseConfig());
/** Tests only. */
export const resetConfig = () => {
  cached = undefined;
};
