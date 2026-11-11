import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule, configure } from "./app.module";
import { sessionSecret } from "./auth/actor";
import { issueToken } from "./auth/token";

/**
 * API + Postgres, through the real Nest app. Runs in CI against a seeded
 * throwaway database (PODIUM_INTEGRATION=1); skipped locally so it can never
 * touch a real one by accident.
 */
describe.runIf(process.env.PODIUM_INTEGRATION === "1")("API with a database", () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const tokens: Record<string, string> = {};
  let acmeDraft: { id: string; version: number };
  let viewerVisible: { id: string; version: number };

  beforeAll(async () => {
    app = configure(await NestFactory.create(AppModule, { rawBody: true, logger: false }));
    await app.init();
    for (const u of await prisma.user.findMany()) tokens[u.email] = issueToken(u.id, sessionSecret());
    acmeDraft = await prisma.campaign.findFirstOrThrow({ where: { name: "Tokyo Winter Sale" }, select: { id: true, version: true } });
    // The viewer is assigned Acme US + Outlet, so this one is visible to them but not editable.
    viewerVisible = await prisma.campaign.findFirstOrThrow({ where: { name: "Black Friday Weekend" }, select: { id: true, version: true } });
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  const as = (email: string) => ({ Authorization: `Bearer ${tokens[email]}` });

  it("401s without a session, in the envelope, with the request id echoed", async () => {
    const res = await request(app.getHttpServer()).get("/api/campaigns").set("x-request-id", "req-int-1");
    expect(res.status).toBe(401);
    expect(res.headers["x-request-id"]).toBe("req-int-1");
    expect(res.body).toEqual({ error: "unauthorized", message: expect.stringMatching(/Sign in again/), requestId: "req-int-1" });
  });

  it("answers another tenant's campaign id with 404, not 403, so ids can't be probed", async () => {
    const res = await request(app.getHttpServer()).get(`/api/campaigns/${acmeDraft.id}`).set(as("owner@northwind.test"));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });

  it("hides campaigns on brands a viewer isn't assigned to (404, same as another tenant)", async () => {
    const res = await request(app.getHttpServer()).get(`/api/campaigns/${acmeDraft.id}`).set(as("viewer@acme.test"));
    expect(res.status).toBe(404);
  });

  it("only lists the caller's tenant", async () => {
    const res = await request(app.getHttpServer()).get("/api/campaigns?pageSize=100").set(as("owner@northwind.test"));
    expect(res.status).toBe(200);
    expect(res.body.rows.map((r: { name: string }) => r.name)).toEqual(["Northwind Regulars"]);
  });

  it("refuses a viewer's write server-side, whatever the UI shows", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/campaigns/${viewerVisible.id}/cancel`)
      .set(as("viewer@acme.test"))
      .send({ version: viewerVisible.version });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
  });

  it("rejects a stale version with 409 instead of overwriting someone else's save", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/campaigns/${acmeDraft.id}/cancel`)
      .set(as("owner@acme.test"))
      .send({ version: acmeDraft.version + 100 });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "conflict", message: expect.stringMatching(/Reload/) });
  });

  it("returns field-level validation details from the shared schema", async () => {
    const res = await request(app.getHttpServer()).post("/api/campaigns").set(as("owner@acme.test")).send({ name: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation");
    expect(res.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ path: "name" })]));
  });

  it("doesn't leak persistence fields in the campaign detail", async () => {
    const res = await request(app.getHttpServer()).get(`/api/campaigns/${acmeDraft.id}`).set(as("owner@acme.test"));
    expect(res.status).toBe(200);
    for (const p of res.body.prizes) expect(Object.keys(p).sort()).toEqual(["amountMinor", "description", "place", "type"]);
  });

  it("rejects an unsigned transition delivery", async () => {
    const res = await request(app.getHttpServer()).post("/api/internal/transitions").send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
  });
});
