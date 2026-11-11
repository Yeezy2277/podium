import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { IncomingMessage, ServerResponse } from "node:http";
import { AppModule, configure } from "./app.module";
import { config } from "./config";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
let cached: Promise<Handler> | undefined;

/**
 * Vercel function entry: boot Nest once per instance and reuse it across
 * invocations, so only cold starts pay the bootstrap cost.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  cached ??= (async () => {
    config(); // fail fast on a misconfigured deploy
    const app = configure(await NestFactory.create(AppModule, { rawBody: true, logger: ["error", "warn", "log"] }));
    await app.init();
    return app.getHttpAdapter().getInstance() as Handler;
  })();
  (await cached)(req, res);
}
