import type {
  FastifyInstance,
} from "fastify";

import { z } from "zod";

import {
  analyzeDirection,
} from "../services/analyzeDirection.js";

const AnalyzeDirectionRequest =
  z.object({
    statement:
      z.string()
        .trim()
        .min(10)
        .max(2000),
  });

export async function directionRoutes(
  app: FastifyInstance
) {
  app.post(
    "/direction/analyze",

    async (
      request,
      reply
    ) => {
      const parsed =
        AnalyzeDirectionRequest
          .safeParse(
            request.body
          );

      if (!parsed.success) {
        return reply
          .status(400)
          .send({
            error:
              "invalid_statement",

            message:
              "Statement must be between 10 and 2000 characters.",
          });
      }

      try {
        const analysis =
          await analyzeDirection(
            parsed.data
              .statement
          );

        return reply.send(
          analysis
        );
      } catch (error) {
        request.log.error(
          error
        );

        return reply
          .status(502)
          .send({
            error:
              "direction_analysis_failed",

            message:
              "Alignment could not analyze the direction right now.",
          });
      }
    }
  );
}