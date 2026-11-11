import { afterEach, describe, expect, it } from "vitest";
import { flag, parseConfig } from "./config";

describe("flag", () => {
  afterEach(() => delete process.env.TEST_FLAG);
  it.each(['true', ' true ', '"true"', "TRUE", "1", "yes"])("reads %j as on", (v) => {
    process.env.TEST_FLAG = v;
    expect(flag("TEST_FLAG")).toBe(true);
  });
  it.each(["", "false", "0", "no"])("reads %j as off", (v) => {
    process.env.TEST_FLAG = v;
    expect(flag("TEST_FLAG")).toBe(false);
  });
});

describe("parseConfig", () => {
  const base = { DATABASE_URL: "postgresql://localhost/podium" };

  it("runs locally with only a database", () => {
    expect(parseConfig(base)).toMatchObject({ scheduler: "sweep-only", signingKeys: [] });
  });

  it("refuses production without a session secret", () => {
    expect(() => parseConfig({ ...base, NODE_ENV: "production" })).toThrow(/SESSION_SECRET: required in production/);
  });

  it("refuses QStash without a signing key or a public URL, listing both", () => {
    const run = () => parseConfig({ ...base, QSTASH_TOKEN: "qs-token-value" });
    expect(run).toThrow(/QSTASH_CURRENT_SIGNING_KEY/);
    expect(run).toThrow(/PUBLIC_API_URL/);
    expect(run).not.toThrow(/qs-token-value/);
  });

  it("turns QStash on only when it's fully configured", () => {
    const c = parseConfig({
      ...base,
      QSTASH_TOKEN: "t",
      QSTASH_CURRENT_SIGNING_KEY: "a",
      QSTASH_NEXT_SIGNING_KEY: " ",
      PUBLIC_API_URL: "https://podium.example/",
    });
    expect(c).toMatchObject({ scheduler: "qstash", signingKeys: ["a"], PUBLIC_API_URL: "https://podium.example" });
  });

  it("requires a database", () => {
    expect(() => parseConfig({})).toThrow(/DATABASE_URL/);
  });
});
