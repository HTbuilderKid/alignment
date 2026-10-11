import cors from "@fastify/cors";
import Fastify from "fastify";

import { env } from "./config/env.js";

import {
  directionRoutes,
} from "./routes/directionRoutes.js";

const app =
  Fastify({
    logger: true,
  });

await app.register(
  cors,
  {
    /*
     * Development only.
     *
     * We will restrict this when
     * we deploy the production API.
     */
    origin: true,
  }
);

app.get(
  "/health",
  async () => {
    return {
      status: "ok",
      service:
        "alignment-api",
    };
  }
);

await app.register(
  directionRoutes,
  {
    prefix: "/api/v1",
  }
);

try {
  await app.listen({
    port: env.PORT,
    host: env.HOST,
  });
} catch (error) {
  app.log.error(error);

  process.exit(1);
}