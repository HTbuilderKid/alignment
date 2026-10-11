import "dotenv/config";

import { z } from "zod";

const EnvironmentSchema = z.object({
  OPENAI_API_KEY:
    z.string().min(1),

  OPENAI_MODEL:
    z.string().default(
      "gpt-6-luna"
    ),

  PORT:
    z.coerce
      .number()
      .int()
      .positive()
      .default(3001),

  HOST:
    z.string().default(
      "0.0.0.0"
    ),
});

export const env =
  EnvironmentSchema.parse(
    process.env
  );