import {
  DirectionAnalysisSchema,
  type DirectionAnalysis,
} from "@alignment/schemas";

const API_URL =
  process.env
    .EXPO_PUBLIC_API_URL;

export async function analyzeDirection(
  statement: string
): Promise<DirectionAnalysis> {
  if (!API_URL) {
    throw new Error(
      "EXPO_PUBLIC_API_URL is not configured."
    );
  }

  const response =
    await fetch(
      `${API_URL}/api/v1/direction/analyze`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            statement,
          }),
      }
    );

  if (!response.ok) {
    throw new Error(
      `Direction analysis failed with status ${response.status}.`
    );
  }

  const json =
    await response.json();

  /*
   * Never blindly trust network data,
   * including data from our own API.
   */
  return DirectionAnalysisSchema
    .parse(json);
}