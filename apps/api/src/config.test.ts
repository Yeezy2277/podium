import { afterEach, describe, expect, it } from "vitest";
import { flag } from "./config";

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
