import test from "node:test";
import assert from "node:assert/strict";
import type { Message, ToolUseBlock } from "@aws-sdk/client-bedrock-runtime";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { AgentRunner, type TraceEvent } from "../runner/agent";
import type { AttachedMcp } from "../runner/mcp-client";
import type { BedrockConverseClient, ConverseArgs, ConverseTurn } from "../bedrock/client";
import { MODELS } from "../bedrock/models";

/**
 * Proves the agent's Converse ↔ tool-use cycle without hitting AWS.
 *
 * We inject:
 *   • a FakeBedrock that returns a scripted two-turn conversation
 *     (turn 1 = tool_use list_markets, turn 2 = end with text), and
 *   • a FakeMcp that advertises a `list_markets` tool and returns a
 *     canned JSON payload.
 *
 * The test fails if the runner:
 *   - does not route the tool call to the right mcp,
 *   - does not feed the tool result back on turn 2,
 *   - does not surface the final text,
 *   - does not emit the expected trace sequence.
 */

interface FakeTurn {
  stopReason: "tool_use" | "end_turn";
  toolUses?: Array<{ name: string; input: Record<string, unknown> }>;
  text?: string;
}

class FakeBedrock implements Pick<BedrockConverseClient, "converse"> {
  calls = 0;
  public readonly observedArgs: ConverseArgs[] = [];

  constructor(private readonly scripted: FakeTurn[]) {}

  async converse(args: ConverseArgs): Promise<ConverseTurn> {
    this.observedArgs.push(args);
    const turn = this.scripted[this.calls++];
    if (!turn) throw new Error("FakeBedrock: script exhausted");
    const content: Message["content"] = [];
    if (turn.text) content.push({ text: turn.text });
    const toolUses: ToolUseBlock[] = (turn.toolUses ?? []).map((u, i) => ({
      toolUseId: `tu_${this.calls}_${i}`,
      name: u.name,
      input: u.input as unknown as ToolUseBlock["input"],
    }));
    for (const tu of toolUses) {
      content.push({
        toolUse: { toolUseId: tu.toolUseId, name: tu.name, input: tu.input },
      } as never);
    }
    return {
      message: { role: "assistant", content },
      stopReason: turn.stopReason,
      toolUses,
      text: turn.text ?? "",
      usage: { inputTokens: 42, outputTokens: 17, totalTokens: 59 },
    };
  }
}

function fakeMcp(): AttachedMcp {
  const callTool = async (params: { name: string; arguments?: unknown }) => {
    if (params.name === "list_markets") {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              count: 1,
              source: "fake",
              markets: [
                {
                  id: "fake-market",
                  title: "Is this test green?",
                  priceYesBps: 9900,
                  priceNoBps: 100,
                },
              ],
            }),
          },
        ],
      };
    }
    return {
      isError: true,
      content: [{ type: "text", text: `unknown tool ${params.name}` }],
    };
  };
  return {
    id: "huggyarena",
    // Only the two surface methods the runner uses need to be typed.
    client: { callTool, close: async () => {} } as unknown as Client,
    listToolsResponse: {
      tools: [
        {
          name: "list_markets",
          description: "List demo markets.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
        },
      ],
    } as AttachedMcp["listToolsResponse"],
    child: null,
    close: async () => {},
  };
}

test("runner executes a two-turn tool_use ↔ text cycle", async () => {
  const script: FakeTurn[] = [
    { stopReason: "tool_use", toolUses: [{ name: "huggyarena__list_markets", input: {} }] },
    { stopReason: "end_turn", text: "Found 1 market at 99% YES." },
  ];
  const bedrock = new FakeBedrock(script) as unknown as BedrockConverseClient;
  const mcp = fakeMcp();
  const trace: TraceEvent[] = [];
  const runner = new AgentRunner({
    model: MODELS[0],
    bedrock,
    mcps: [mcp],
    trace: (e) => trace.push(e),
  });

  const result = await runner.chat("how are markets today");
  assert.equal(result.turns, 2, "two Converse calls");
  assert.equal(result.stopReason, "end_turn");
  assert.match(result.text, /1 market/);
  assert.equal(result.usage.totalInputTokens, 84);
  assert.equal(result.usage.totalOutputTokens, 34);

  const kinds = trace.map((e) => e.type);
  assert.ok(kinds.includes("turn-start"));
  assert.ok(kinds.includes("tool-call"));
  assert.ok(kinds.includes("tool-result"));
  assert.ok(kinds.includes("stop"));

  const toolCall = trace.find((e) => e.type === "tool-call");
  assert.ok(toolCall && toolCall.type === "tool-call");
  if (toolCall.type === "tool-call") {
    assert.equal(toolCall.server, "huggyarena");
    assert.equal(toolCall.name, "list_markets");
  }
});

test("runner surfaces tool errors without crashing the loop", async () => {
  const script: FakeTurn[] = [
    { stopReason: "tool_use", toolUses: [{ name: "huggyarena__not_a_tool", input: {} }] },
    { stopReason: "end_turn", text: "Recovered from bad tool." },
  ];
  const bedrock = new FakeBedrock(script) as unknown as BedrockConverseClient;
  const mcp = fakeMcp();
  const trace: TraceEvent[] = [];
  const runner = new AgentRunner({
    model: MODELS[0],
    bedrock,
    mcps: [mcp],
    trace: (e) => trace.push(e),
  });

  const result = await runner.chat("make a mistake");
  assert.equal(result.stopReason, "end_turn");
  const errorTrace = trace.find(
    (e) => e.type === "tool-result" && e.isError,
  );
  assert.ok(errorTrace, "error trace must be emitted when tool is unknown");
});

test("runner respects maxTurns and bails cleanly", async () => {
  const script: FakeTurn[] = [
    { stopReason: "tool_use", toolUses: [{ name: "huggyarena__list_markets", input: {} }] },
    { stopReason: "tool_use", toolUses: [{ name: "huggyarena__list_markets", input: {} }] },
    { stopReason: "tool_use", toolUses: [{ name: "huggyarena__list_markets", input: {} }] },
  ];
  const bedrock = new FakeBedrock(script) as unknown as BedrockConverseClient;
  const runner = new AgentRunner({
    model: MODELS[0],
    bedrock,
    mcps: [fakeMcp()],
    maxTurns: 2,
  });
  const result = await runner.chat("loop");
  assert.equal(result.turns, 2);
  assert.equal(result.stopReason, "tool_use", "last script turn stays tool_use");
});
