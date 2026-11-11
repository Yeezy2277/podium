import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule, configure } from "./app.module";
import { config } from "./config";

async function bootstrap() {
  config(); // fail fast with every env problem listed, before Nest wires anything
  // rawBody: QStash signs the exact bytes, so the transitions endpoint needs them unparsed.
  const app = configure(await NestFactory.create(AppModule, { rawBody: true }));
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`Podium API on http://localhost:${port}/api`);
}

void bootstrap();
