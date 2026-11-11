import { type INestApplication, Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { CampaignsController } from "./campaigns/campaigns.controller";
import { CampaignsService } from "./campaigns/campaigns.service";
import { DomainErrorFilter } from "./common/http";
import { InternalController } from "./internal.controller";
import { MeController } from "./me.controller";
import { PrismaService } from "./prisma.service";
import { QStashScheduler, SCHEDULER, SweepOnlyScheduler } from "./scheduler/scheduler";

@Module({
  controllers: [CampaignsController, MeController, InternalController],
  providers: [
    PrismaService,
    CampaignsService,
    { provide: APP_FILTER, useClass: DomainErrorFilter },
    {
      provide: SCHEDULER,
      useFactory: () =>
        process.env.QSTASH_TOKEN && process.env.PUBLIC_API_URL
          ? new QStashScheduler(process.env.QSTASH_URL ?? "https://qstash.upstash.io", process.env.QSTASH_TOKEN, `${process.env.PUBLIC_API_URL}/api/internal/transitions`)
          : new SweepOnlyScheduler(),
    },
  ],
})
export class AppModule {}

/** Shared setup for the local server and the serverless handler. */
export function configure(app: INestApplication) {
  app.setGlobalPrefix("api");
  app.enableCors({ origin: process.env.ADMIN_ORIGIN?.split(",") ?? true });
  return app;
}
