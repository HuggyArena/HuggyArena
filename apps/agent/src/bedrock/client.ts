import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type ConversationRole,
  type Message,
  type Tool,
  type ToolConfiguration,
  type ToolResultBlock,
  type ToolResultContentBlock,
  type ToolUseBlock,
} from "@aws-sdk/client-bedrock-runtime";
import { resolveModel, type ModelSpec } from "./models";

/**
 * Thin wrapper around Bedrock's Converse API.
 *
 * Why Converse and not InvokeModel:
 *   • Converse normalizes tool_use / tool_result across Anthropic, Amazon
 *     Nova, Llama 4, etc. — so swapping models doesn't require rewriting
 *     the tool plumbing.
 *   • Tool schemas are supplied as JSON Schema, which is exactly what the
 *     MCP server returns from `listTools()` — zero translation.
 *
 * The client is intentionally stateless: the agent loop owns conversation
 * history and replays it on each turn. That makes offline testing trivial
 * (fake the client, not the loop) and keeps multi-turn tool use
 * deterministic.
 */
export interface ConverseArgs {
  model: ModelSpec;
  system: string;
  messages: Message[];
  tools?: Tool[];
  /** Soft cap on output tokens per turn. */
  maxTokens?: number;
  temperature?: number;
}

export interface ConverseTurn {
  /** The assistant's reply, already appended to `messages`. */
  message: Message;
  /** Why the model stopped. `tool_use` means we must execute tools and loop. */
  stopReason: string;
  /** Convenience: tool_use blocks pulled out of the assistant message. */
  toolUses: ToolUseBlock[];
  /** Convenience: concatenated text blocks. */
  text: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export class BedrockConverseClient {
  private readonly sdk: BedrockRuntimeClient;

  constructor(region?: string) {
    this.sdk = new BedrockRuntimeClient({
      region: region ?? process.env.AWS_REGION ?? "us-east-1",
    });
  }

  async converse(args: ConverseArgs): Promise<ConverseTurn> {
    const toolConfig: ToolConfiguration | undefined = args.tools?.length
      ? { tools: args.tools }
      : undefined;

    const command = new ConverseCommand({
      modelId: args.model.id,
      system: [{ text: args.system }],
      messages: args.messages,
      toolConfig,
      inferenceConfig: {
        maxTokens: args.maxTokens ?? 4096,
        temperature: args.temperature ?? 0.2,
      },
    });
    const res = await this.sdk.send(command);
    const message: Message = {
      role: (res.output?.message?.role ?? "assistant") as ConversationRole,
      content: res.output?.message?.content ?? [],
    };
    const toolUses: ToolUseBlock[] = [];
    const textParts: string[] = [];
    for (const block of message.content ?? []) {
      if ("toolUse" in block && block.toolUse) toolUses.push(block.toolUse);
      if ("text" in block && typeof block.text === "string")
        textParts.push(block.text);
    }
    return {
      message,
      stopReason: res.stopReason ?? "unknown",
      toolUses,
      text: textParts.join("\n"),
      usage: res.usage
        ? {
            inputTokens: res.usage.inputTokens,
            outputTokens: res.usage.outputTokens,
            totalTokens: res.usage.totalTokens,
          }
        : undefined,
    };
  }
}

/**
 * Build the Bedrock `content` list for a tool result message.
 *
 * MCP tool results are strings (or structured content blocks). For Phase 1A
 * we stringify everything — JSON payloads are small, the reasoner handles
 * them fine, and sticking to text makes the traces readable for humans.
 */
export function toolResultContent(
  toolUseId: string,
  payload: unknown,
  isError = false,
): ContentBlock {
  const text =
    typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  const inner: ToolResultContentBlock = { text };
  const toolResult: ToolResultBlock = {
    toolUseId,
    content: [inner],
    status: isError ? "error" : "success",
  };
  return { toolResult } as unknown as ContentBlock;
}

/** Re-export for convenience. */
export { resolveModel };
export type { Message, Tool, ToolUseBlock, ContentBlock };
