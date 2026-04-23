import type {
  ContentBlock,
  Message,
  Tool,
  ToolUseBlock,
} from "@aws-sdk/client-bedrock-runtime";
import {
  BedrockConverseClient,
  toolResultContent,
} from "../bedrock/client";
import {
  DEFAULT_MODEL_ALIAS,
  resolveModel,
  type ModelSpec,
} from "../bedrock/models";
import type { AttachedMcp } from "./mcp-client";
import { buildSystemPrompt } from "./system-prompt";
import { loadSkillsByName, type LoadedSkill } from "./skills";

/**
 * The agent loop. One `chat(prompt)` call runs the full Converse ↔ tool-use
 * cycle until the model either finishes with text or hits the iteration cap.
 *
 * Design notes:
 *   • Conversation history lives on the agent, not on Bedrock — Converse is
 *     stateless, we replay messages every turn.
 *   • Tool calls are executed in parallel when the model emits multiple in
 *     one assistant message — matches the Converse spec and shaves latency.
 *   • Trace lines go to the `trace` callback so the CLI can pretty-print them
 *     and tests can snapshot them.
 */
export interface AgentRunnerOptions {
  model?: string | ModelSpec;
  mcps?: AttachedMcp[];
  skillNames?: string[];
  operatorMode?: boolean;
  /** Max assistant ↔ tool ping-pong turns before we force-stop. */
  maxTurns?: number;
  /** Override the Bedrock client for testing. */
  bedrock?: BedrockConverseClient;
  /** Callback for every trace event. */
  trace?: (event: TraceEvent) => void;
}

export type TraceEvent =
  | { type: "turn-start"; turn: number }
  | { type: "assistant-text"; text: string; turn: number }
  | {
      type: "tool-call";
      turn: number;
      server: string;
      name: string;
      input: unknown;
    }
  | {
      type: "tool-result";
      turn: number;
      server: string;
      name: string;
      isError: boolean;
      preview: string;
    }
  | { type: "stop"; turn: number; reason: string }
  | {
      type: "usage";
      turn: number;
      inputTokens?: number;
      outputTokens?: number;
    };

export interface ChatResult {
  text: string;
  turns: number;
  stopReason: string;
  messages: Message[];
  usage: {
    totalInputTokens: number;
    totalOutputTokens: number;
  };
}

interface ResolvedTool {
  bedrockName: string; // flattened name (e.g. "huggyarena__list_markets")
  serverId: string; // "huggyarena"
  originalName: string; // "list_markets"
  description: string;
  inputSchema: Record<string, unknown>;
  mcp: AttachedMcp;
}

/**
 * Converts MCP tool names to Bedrock-safe names. Bedrock enforces
 * `^[a-zA-Z][a-zA-Z0-9_]{0,63}$`, so we prefix with the server id joined by
 * `__`. That also keeps two MCP servers that happen to expose `list` or
 * `search` from colliding.
 */
function flatten(serverId: string, toolName: string): string {
  return `${serverId}__${toolName}`.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 63);
}

function unflatten(flat: string): { serverId: string; toolName: string } {
  const idx = flat.indexOf("__");
  if (idx === -1) return { serverId: "", toolName: flat };
  return { serverId: flat.slice(0, idx), toolName: flat.slice(idx + 2) };
}

export class AgentRunner {
  private readonly bedrock: BedrockConverseClient;
  private readonly modelSpec: ModelSpec;
  private readonly mcps: AttachedMcp[];
  private readonly tools: ResolvedTool[];
  private readonly bedrockTools: Tool[];
  private readonly skills: LoadedSkill[];
  private readonly operatorMode: boolean;
  private readonly maxTurns: number;
  private readonly trace?: (e: TraceEvent) => void;
  private readonly systemPrompt: string;
  private readonly history: Message[] = [];

  constructor(opts: AgentRunnerOptions = {}) {
    this.bedrock = opts.bedrock ?? new BedrockConverseClient();
    this.modelSpec =
      typeof opts.model === "string" || opts.model === undefined
        ? resolveModel(opts.model ?? DEFAULT_MODEL_ALIAS)
        : opts.model;
    this.mcps = opts.mcps ?? [];
    this.operatorMode = opts.operatorMode ?? false;
    this.maxTurns = opts.maxTurns ?? 12;
    this.trace = opts.trace;
    this.skills = loadSkillsByName(opts.skillNames ?? []);
    this.tools = this.resolveTools();
    this.bedrockTools = this.tools.map(
      (t): Tool => ({
        toolSpec: {
          name: t.bedrockName,
          description: t.description,
          inputSchema: { json: t.inputSchema as never },
        },
      }),
    );
    this.systemPrompt = buildSystemPrompt({
      model: this.modelSpec,
      skillsTitle: this.skills.length ? "Active skills" : undefined,
      skillBodies: this.skills.map((s) => s.body),
      operatorMode: this.operatorMode,
    });
  }

  get model(): ModelSpec {
    return this.modelSpec;
  }

  get toolCount(): number {
    return this.tools.length;
  }

  get systemPromptText(): string {
    return this.systemPrompt;
  }

  private resolveTools(): ResolvedTool[] {
    const out: ResolvedTool[] = [];
    for (const mcp of this.mcps) {
      for (const t of mcp.listToolsResponse.tools) {
        out.push({
          bedrockName: flatten(mcp.id, t.name),
          serverId: mcp.id,
          originalName: t.name,
          description: t.description ?? "",
          inputSchema: (t.inputSchema as Record<string, unknown>) ?? {
            type: "object",
            properties: {},
          },
          mcp,
        });
      }
    }
    return out;
  }

  async chat(prompt: string): Promise<ChatResult> {
    this.history.push({ role: "user", content: [{ text: prompt }] });
    let stopReason = "";
    let totalIn = 0;
    let totalOut = 0;
    let finalText = "";
    let turn = 0;

    while (turn < this.maxTurns) {
      turn++;
      this.trace?.({ type: "turn-start", turn });
      const result = await this.bedrock.converse({
        model: this.modelSpec,
        system: this.systemPrompt,
        messages: this.history,
        tools: this.bedrockTools.length ? this.bedrockTools : undefined,
      });
      this.history.push(result.message);
      totalIn += result.usage?.inputTokens ?? 0;
      totalOut += result.usage?.outputTokens ?? 0;
      this.trace?.({
        type: "usage",
        turn,
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
      });
      if (result.text) {
        this.trace?.({ type: "assistant-text", text: result.text, turn });
        finalText = result.text;
      }
      stopReason = result.stopReason;
      if (result.stopReason !== "tool_use" || result.toolUses.length === 0) {
        this.trace?.({ type: "stop", turn, reason: result.stopReason });
        break;
      }

      const toolResults = await Promise.all(
        result.toolUses.map((use) => this.executeTool(use, turn)),
      );
      this.history.push({ role: "user", content: toolResults });
    }

    return {
      text: finalText,
      turns: turn,
      stopReason,
      messages: [...this.history],
      usage: {
        totalInputTokens: totalIn,
        totalOutputTokens: totalOut,
      },
    };
  }

  private async executeTool(
    use: ToolUseBlock,
    turn: number,
  ): Promise<ContentBlock> {
    const { serverId, toolName } = unflatten(use.name ?? "");
    const resolved = this.tools.find((t) => t.bedrockName === use.name);
    if (!resolved) {
      this.trace?.({
        type: "tool-result",
        turn,
        server: serverId,
        name: toolName,
        isError: true,
        preview: `unknown tool ${use.name}`,
      });
      return toolResultContent(
        use.toolUseId ?? "",
        `Unknown tool: ${use.name}`,
        true,
      );
    }
    this.trace?.({
      type: "tool-call",
      turn,
      server: resolved.serverId,
      name: resolved.originalName,
      input: use.input,
    });
    try {
      const callResultRaw = await resolved.mcp.client.callTool({
        name: resolved.originalName,
        arguments: (use.input as Record<string, unknown>) ?? {},
      });
      const callResult = callResultRaw as {
        isError?: boolean;
        content?: Array<{ type: string; text?: string }>;
      };
      const isError = Boolean(callResult.isError);
      const textBlocks = (callResult.content ?? [])
        .filter(
          (c): c is { type: "text"; text: string } =>
            c.type === "text" && typeof c.text === "string",
        )
        .map((c) => c.text);
      const payload = textBlocks.join("\n");
      this.trace?.({
        type: "tool-result",
        turn,
        server: resolved.serverId,
        name: resolved.originalName,
        isError,
        preview: payload.slice(0, 200),
      });
      return toolResultContent(
        use.toolUseId ?? "",
        payload || "(empty tool result)",
        isError,
      );
    } catch (err) {
      const msg = (err as Error).message;
      this.trace?.({
        type: "tool-result",
        turn,
        server: resolved.serverId,
        name: resolved.originalName,
        isError: true,
        preview: msg,
      });
      return toolResultContent(use.toolUseId ?? "", msg, true);
    }
  }
}
