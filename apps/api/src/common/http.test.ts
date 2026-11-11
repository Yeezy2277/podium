import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { conflict, DomainError } from "../domain/errors";
import { toErrorBody, ZodPipe } from "./http";

describe("toErrorBody", () => {
  it("maps domain errors to their status with details", () => {
    expect(toErrorBody(conflict("Reload to see their changes", { version: 3 }), "r1")).toEqual({
      status: 409,
      body: { error: "conflict", message: "Reload to see their changes", details: { version: 3 }, requestId: "r1" },
    });
  });

  it("gives Nest's own exceptions the same shape instead of { statusCode, message }", () => {
    expect(toErrorBody(new UnauthorizedException("Sign in again"), "r2")).toEqual({
      status: 401,
      body: { error: "unauthorized", message: "Sign in again", requestId: "r2" },
    });
    expect(toErrorBody(new ForbiddenException(), "r3").body).toMatchObject({ error: "forbidden", requestId: "r3" });
  });

  it("never echoes an unexpected error's text to the caller", () => {
    const { status, body } = toErrorBody(new Error('relation "Secret" does not exist'), "r4");
    expect(status).toBe(500);
    expect(body.error).toBe("internal");
    expect(body.message).not.toContain("Secret");
    expect(body.message).toContain("r4");
  });
});

describe("ZodPipe", () => {
  it("reports each field under details, in the same envelope as everything else", () => {
    const pipe = new ZodPipe(z.object({ name: z.string().min(3, "Name is too short") }));
    let thrown: unknown;
    try {
      pipe.transform({ name: "x" });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(DomainError);
    expect(toErrorBody(thrown, "r5")).toEqual({
      status: 400,
      body: {
        error: "validation",
        message: "Some fields need attention",
        details: [{ path: "name", message: "Name is too short" }],
        requestId: "r5",
      },
    });
  });
});
