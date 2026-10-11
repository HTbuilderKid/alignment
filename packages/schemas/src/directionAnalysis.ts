import { z } from "zod";

export const DirectionAnalysisItemSchema =
  z.object({
    kind: z.enum([
      "toward",
      "reduce",
    ]),

    title: z.string(),

    description:
      z.string().nullable(),
  });

export const DirectionAnalysisSchema =
  z.object({
    items: z.array(
      DirectionAnalysisItemSchema
    ),
  });

export type DirectionAnalysis =
  z.infer<
    typeof DirectionAnalysisSchema
  >;

export type DirectionAnalysisItem =
  z.infer<
    typeof DirectionAnalysisItemSchema
  >;