import {
  DirectionAnalysisSchema,
  type DirectionAnalysis,
} from "@alignment/schemas";

import {
  zodTextFormat,
} from "openai/helpers/zod";

import { env } from "../config/env.js";
import { openai } from "./openaiClient.js";

const SYSTEM_PROMPT = `
You are the direction interpretation engine
for Alignment.

Alignment helps people act more consistently
with the life and priorities they themselves
have chosen.

Your task is to convert a user's free-form
description of what they want into a small,
clear set of structured direction items.

There are two kinds:

"toward"
Something the user explicitly wants more of,
wants to become more consistent with, or
wants to move toward.

"reduce"
Something the user explicitly wants less of
or wants to reduce.

Important rules:

1. Preserve the user's intent.
2. Do not invent goals that the user did not
   express or strongly imply.
3. Do not decide what a good life should look
   like for the user.
4. Do not moralize entertainment, rest,
   gaming, social media, productivity,
   school, work, relationships, or exercise.
5. Do not diagnose the user or infer mental
   health conditions.
6. Do not infer sensitive personal traits.
7. Keep each title short and actionable.
8. Merge obvious duplicates.
9. Prefer approximately 2-6 useful items
   rather than extracting every sentence.
10. A description should briefly preserve
    useful context from the user's statement.
11. If the statement does not support a
    meaningful item, return fewer items.
12. It is acceptable to return an empty items
    array rather than inventing intentions.

The result is only a proposal.

The user will review, change, add, remove,
or reject every item before Alignment stores
the structured model.
`;

export async function analyzeDirection(
  statement: string
): Promise<DirectionAnalysis> {
  const response =
    await openai.responses.parse({
      model:
        env.OPENAI_MODEL,

      input: [
        {
          role: "system",
          content:
            SYSTEM_PROMPT,
        },
        {
          role: "user",
          content:
            statement,
        },
      ],

      text: {
        format:
          zodTextFormat(
            DirectionAnalysisSchema,
            "direction_analysis"
          ),
      },
    });

  const result =
    response.output_parsed;

  if (!result) {
    throw new Error(
      "OpenAI returned no parsed direction analysis."
    );
  }

  return result;
}