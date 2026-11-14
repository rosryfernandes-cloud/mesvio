import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_MODEL, AI_MODEL_LIGHT, askClaudeJson } from "./claude";
import { z } from "zod";

describe("chamadas à Claude", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("se o modelo mais barato recusar o pedido, repete no modelo principal", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-api03-" + "a".repeat(40));
    const models: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        models.push(body.model);
        if (body.model === AI_MODEL_LIGHT) {
          return new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "nope" } }), { status: 400, headers: { "content-type": "application/json" } });
        }
        return new Response(
          JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: AI_MODEL, content: [{ type: "text", text: '{"answer":"ok"}' }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    const r = await askClaudeJson(z.object({ answer: z.string() }), { tag: "t", system: "s", content: [{ type: "text", text: "q" }], maxTokens: 100, effort: "low", model: AI_MODEL_LIGHT });
    expect(r.data).toEqual({ answer: "ok" });
    expect(models).toEqual([AI_MODEL_LIGHT, AI_MODEL]);
  });
});
