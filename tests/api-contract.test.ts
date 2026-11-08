import assert from "node:assert/strict";
import { before, test } from "node:test";
import Fastify from "fastify";

let directionRoutes: typeof import("../apps/api/src/routes/directionRoutes").directionRoutes;
let openai: typeof import("../apps/api/src/services/openaiClient").openai;

before(async () => {
  // Load the real API with a dummy credential. Every network call is intercepted
  // below, so these contract tests never use a developer's key or call OpenAI.
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "step6-contract-test-only";
  try {
    ({ directionRoutes } = await import(
      "../apps/api/src/routes/directionRoutes"
    ));
    ({ openai } = await import("../apps/api/src/services/openaiClient"));
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

function responseWith(analysis: unknown) {
  return new Response(
    JSON.stringify({
      id: "resp_contract",
      object: "response",
      status: "completed",
      output: [
        {
          id: "msg_contract",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "output_text",
              text: JSON.stringify(analysis),
              annotations: [],
            },
          ],
        },
      ],
    }),
    { headers: { "content-type": "application/json" } },
  );
}

test("API rejects invalid statements before contacting OpenAI", async (t) => {
  const fetch = t.mock.method(openai, "fetch", async () => {
    throw new Error("Invalid input must not reach OpenAI");
  });
  const app = Fastify();
  t.after(() => app.close());
  await app.register(directionRoutes, { prefix: "/api/v1" });
  for (const payload of [
    {},
    { statement: 42 },
    { statement: "         " },
    { statement: "a".repeat(9) },
    { statement: "a".repeat(2001) },
  ]) {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/direction/analyze",
      payload,
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, "invalid_statement");
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("API and OpenAI SDK round-trip the shared Zod 4 direction schema", async (t) => {
  const analysis = {
    items: [
      { kind: "toward", title: "Build Alignment", description: null },
      {
        kind: "reduce",
        title: "Unwanted scrolling",
        description: "Only when unintended",
      },
    ],
  };
  const statements: string[] = [];
  t.mock.method(
    openai,
    "fetch",
    async (_url: unknown, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      assert.equal(body.text.format.type, "json_schema");
      assert.equal(body.text.format.name, "direction_analysis");
      assert.equal(body.text.format.strict, true);
      assert.equal(body.text.format.schema.additionalProperties, false);
      assert.deepEqual(body.text.format.schema.required, ["items"]);
      statements.push(body.input[1].content);
      return responseWith(analysis);
    },
  );
  const app = Fastify();
  t.after(() => app.close());
  await app.register(directionRoutes, { prefix: "/api/v1" });
  for (const statement of ["a".repeat(10), "a".repeat(2000)]) {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/direction/analyze",
      payload: { statement: `  ${statement}  ` },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), analysis);
  }
  assert.deepEqual(statements, ["a".repeat(10), "a".repeat(2000)]);
});

test("API accepts an empty Direction proposal without inventing goals", async (t) => {
  t.mock.method(openai, "fetch", async () => responseWith({ items: [] }));
  const app = Fastify();
  t.after(() => app.close());
  await app.register(directionRoutes);
  const response = await app.inject({
    method: "POST",
    url: "/direction/analyze",
    payload: { statement: "Still deciding what I want" },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json(), { items: [] });
});

test("API rejects model output that violates the shared schema", async (t) => {
  t.mock.method(openai, "fetch", async () =>
    responseWith({
      items: [
        { kind: "invented-kind", title: "Invalid item", description: null },
      ],
    }),
  );
  const app = Fastify();
  t.after(() => app.close());
  await app.register(directionRoutes);
  const response = await app.inject({
    method: "POST",
    url: "/direction/analyze",
    payload: { statement: "Work on Alignment" },
  });
  assert.equal(response.statusCode, 502);
  assert.equal(response.json().error, "direction_analysis_failed");
});
