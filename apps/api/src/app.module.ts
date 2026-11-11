import { type INestApplication, Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { CampaignsController } from "./campaigns/campaigns.controller";
import { CampaignsService } from "./campaigns/campaigns.service";
import { ErrorEnvelopeFilter, requestIdMiddleware } from "./common/http";
import { config } from "./config";
import { InternalController } from "./internal.controller";
import { MeController } from "./me.controller";
import { PrismaService } from "./prisma.service";
import { QStashScheduler, SCHEDULER, SweepOnlyScheduler } from "./scheduler/scheduler";

@Module({
  controllers: [CampaignsController, MeController, InternalController],
  providers: [
    PrismaService,
    CampaignsService,
    { provide: APP_FILTER, useClass: ErrorEnvelopeFilter },
    {
      provide: SCHEDULER,
      useFactory: () => {
        const c = config();
        return c.scheduler === "qstash"
          ? new QStashScheduler(c.QSTASH_URL ?? "https://qstash.upstash.io", c.QSTASH_TOKEN!, `${c.PUBLIC_API_URL}/api/internal/transitions`)
          : new SweepOnlyScheduler();
      },
    },
  ],
})
export class AppModule {}

/** Shared setup for the local server and the serverless handler. */
export function configure(app: INestApplication) {
  app.setGlobalPrefix("api");
  app.use(requestIdMiddleware);
  app.enableCors({ origin: config().ADMIN_ORIGIN?.split(",") ?? true, exposedHeaders: ["x-request-id"] });
  return app;
}
